import { between, clamp, pick, weightedPick, type Rng } from '../rng';
import type { Entrance, SpeechKind, Traits } from '../profile/types';

/**
 * Animation Engine — behaviour layer. Decides *what* the character does and for how long.
 * It knows nothing about the DOM, Chrome or a specific character: hosts execute the
 * returned directives and report back. Deterministic for a given random source.
 */

export type Activity =
  | 'hidden' | 'entering' | 'idle' | 'look' | 'wave' | 'walk' | 'jump' | 'talk'
  | 'react' | 'dragging' | 'falling' | 'sleep' | 'waking' | 'exiting';

export type Reaction = 'giggle' | 'hop' | 'spin' | 'blush' | 'dizzy';

export type Mood = 'neutral' | 'happy' | 'surprised' | 'sleepy' | 'dizzy' | 'shy';

export interface Directive {
  activity: Activity;
  /** Planned duration in ms; Infinity for open-ended states (dragging, sleep). */
  durationMs: number;
  mood: Mood;
  entrance?: Entrance;
  /** Walk destination (left edge, px). */
  targetX?: number;
  reaction?: Reaction;
  /** Something to say while doing it. */
  say?: SpeechKind;
}

export interface BrainOptions {
  traits: Traits;
  rng: Rng;
  /** 0.5 calm … 1 normal … 1.6 lively. Scales how often autonomous actions happen. */
  frequency?: number;
  reducedMotion?: boolean;
  /** When false the character never volunteers idle remarks. */
  chatty?: boolean;
  sleepAfterMs?: number;
}

/** What the host knows about the world when asking for the next action. */
export interface World {
  x: number;
  minX: number;
  maxX: number;
  /** Time since the user last moved the mouse, typed or scrolled. */
  userIdleMs: number;
}

export const DURATIONS = {
  entering: 1700,
  wave: 1500,
  jump: 750,
  look: 2000,
  talk: 3200,
  react: 900,
  dizzy: 1900,
  waking: 1300,
  exiting: 650,
} as const;

type Autonomous = 'wave' | 'walk' | 'jump' | 'look' | 'talk';

export class Brain {
  activity: Activity = 'hidden';
  current: Directive = { activity: 'hidden', durationMs: Infinity, mood: 'neutral' };
  private startedAt = 0;
  private lastAutonomous: Autonomous | null = null;
  private clicks: number[] = [];
  readonly history: Activity[] = [];
  private opts: Required<BrainOptions>;

  constructor(opts: BrainOptions) {
    this.opts = { frequency: 1, reducedMotion: false, chatty: true, sleepAfterMs: 120_000, ...opts };
  }

  configure(patch: Partial<BrainOptions>) {
    this.opts = { ...this.opts, ...patch };
  }

  get traits() { return this.opts.traits; }

  /** Walking speed in px/s, from the energy trait. */
  get walkSpeed() { return (this.opts.reducedMotion ? 35 : 45) + 75 * this.opts.traits.energy; }

  private set(d: Directive, now: number): Directive {
    this.current = d;
    this.activity = d.activity;
    this.startedAt = now;
    this.history.push(d.activity);
    if (this.history.length > 200) this.history.shift();
    return d;
  }

  /** Time left in the current directive. */
  remaining(now: number) {
    return this.current.durationMs - (now - this.startedAt);
  }

  enter(now: number, entrance: Entrance | 'random', say?: SpeechKind): Directive {
    const chosen: Entrance = entrance === 'random'
      ? pick(this.opts.reducedMotion ? (['pop'] as const) : (['peek', 'hop', 'pop'] as const), this.opts.rng)
      : this.opts.reducedMotion && entrance === 'hop' ? 'pop' : entrance;
    return this.set({ activity: 'entering', durationMs: DURATIONS.entering, mood: 'happy', entrance: chosen, say }, now);
  }

  exit(now: number): Directive {
    return this.set({ activity: 'exiting', durationMs: DURATIONS.exiting, mood: 'happy' }, now);
  }

  /** The host finished executing the current directive early (or exactly on time). */
  done(now: number, world: World): Directive {
    if (this.activity === 'exiting' || this.activity === 'hidden') {
      return this.set({ activity: 'hidden', durationMs: Infinity, mood: 'neutral' }, now);
    }
    if (this.activity === 'idle') return this.chooseAutonomous(now, world);
    return this.idle(now);
  }

  private idle(now: number): Directive {
    const { energy } = this.opts.traits;
    const f = clamp(this.opts.frequency, 0.3, 2);
    const base = between(3500, 9000, this.opts.rng) * (1.45 - 0.7 * energy);
    const slow = this.opts.reducedMotion ? 1.8 : 1;
    return this.set({ activity: 'idle', durationMs: Math.round((base * slow) / f), mood: 'neutral' }, now);
  }

  /** Called regularly by the host. Returns a new directive when the current one is over. */
  tick(now: number, world: World): Directive | null {
    if (this.activity === 'hidden' || this.activity === 'dragging') return null;
    if (this.activity === 'idle' && world.userIdleMs >= this.opts.sleepAfterMs) {
      return this.set({ activity: 'sleep', durationMs: Infinity, mood: 'sleepy' }, now);
    }
    if (this.remaining(now) > 0) return null;
    return this.done(now, world);
  }

  /** The user did something (mouse, keyboard, scroll). Wakes a sleeping character. */
  userActive(now: number): Directive | null {
    if (this.activity !== 'sleep') return null;
    return this.set({ activity: 'waking', durationMs: DURATIONS.waking, mood: 'surprised', say: 'wake' }, now);
  }

  private chooseAutonomous(now: number, world: World): Directive {
    const { energy, sociability, playfulness } = this.opts.traits;
    const span = world.maxX - world.minX;
    const weights: Record<Autonomous, number> = {
      wave: 0.5 + 1.2 * sociability,
      walk: span > 120 ? 0.5 + 2.2 * energy : 0,
      jump: this.opts.reducedMotion ? 0 : 0.1 + 1.6 * energy * playfulness,
      look: 0.9,
      talk: this.opts.chatty ? 0.15 + 0.9 * sociability : 0,
    };
    if (this.lastAutonomous) weights[this.lastAutonomous] *= 0.3;
    const choice = weightedPick(weights, this.opts.rng) ?? 'look';
    this.lastAutonomous = choice;

    switch (choice) {
      case 'walk': {
        const targetX = this.walkTarget(world);
        const durationMs = Math.max(400, Math.round((Math.abs(targetX - world.x) / this.walkSpeed) * 1000));
        return this.set({ activity: 'walk', durationMs, mood: 'happy', targetX }, now);
      }
      case 'jump':
        return this.set({ activity: 'jump', durationMs: DURATIONS.jump, mood: 'happy' }, now);
      case 'wave':
        return this.set({ activity: 'wave', durationMs: DURATIONS.wave, mood: 'happy' }, now);
      case 'talk':
        return this.set({ activity: 'talk', durationMs: DURATIONS.talk, mood: 'happy', say: 'idle' }, now);
      default:
        return this.set({ activity: 'look', durationMs: DURATIONS.look, mood: 'neutral' }, now);
    }
  }

  walkTarget(world: World): number {
    const span = Math.max(0, world.maxX - world.minX);
    const maxStep = Math.max(80, span * 0.45);
    const step = between(Math.min(80, maxStep), maxStep, this.opts.rng);
    const roomLeft = world.x - world.minX;
    const roomRight = world.maxX - world.x;
    let dir = this.opts.rng() < 0.5 ? -1 : 1;
    if (roomLeft < step) dir = 1;
    else if (roomRight < step) dir = -1;
    return Math.round(clamp(world.x + dir * step, world.minX, world.maxX));
  }

  /** A click / tap on the character. */
  click(now: number): Directive | null {
    if (this.activity === 'hidden' || this.activity === 'exiting' || this.activity === 'entering') return null;
    this.clicks = [...this.clicks.filter((t) => now - t < 3000), now];
    if (this.clicks.length >= 4) {
      this.clicks = [];
      return this.set({ activity: 'react', durationMs: DURATIONS.dizzy, mood: 'dizzy', reaction: 'dizzy', say: 'poke' }, now);
    }
    if (this.activity === 'sleep') return this.userActive(now);
    const { energy, playfulness, sociability } = this.opts.traits;
    const reaction = weightedPick<Reaction>({
      giggle: 1.2,
      hop: this.opts.reducedMotion ? 0 : 0.3 + energy,
      spin: this.opts.reducedMotion ? 0 : 0.2 + playfulness,
      blush: 0.3 + (1 - sociability),
    }, this.opts.rng) ?? 'giggle';
    const speak = this.clicks.length === 1 && this.opts.rng() < 0.4 + 0.4 * sociability;
    const mood: Mood = reaction === 'blush' ? 'shy' : reaction === 'giggle' ? 'happy' : 'surprised';
    return this.set({ activity: 'react', durationMs: DURATIONS.react, mood, reaction, say: speak ? 'click' : undefined }, now);
  }

  grab(now: number): Directive {
    return this.set({ activity: 'dragging', durationMs: Infinity, mood: 'surprised' }, now);
  }

  /**
   * The user let go. With gravity and some height left, the character falls first.
   * @param heightPx distance above the floor
   */
  release(now: number, heightPx: number, gravity: boolean): Directive {
    if (gravity && heightPx > 2) {
      const g = 2600; // px/s², a bit floaty
      const durationMs = Math.round(Math.sqrt((2 * heightPx) / g) * 1000);
      return this.set({ activity: 'falling', durationMs: Math.max(120, durationMs), mood: 'surprised', say: this.opts.rng() < 0.5 ? 'drop' : undefined }, now);
    }
    return this.set({ activity: 'react', durationMs: DURATIONS.react, mood: 'happy', reaction: 'giggle', say: this.opts.rng() < 0.35 ? 'drop' : undefined }, now);
  }

  /** Explicit request to talk (toolbar button, popup). */
  talk(now: number, say: SpeechKind = 'idle'): Directive {
    return this.set({ activity: 'talk', durationMs: DURATIONS.talk, mood: 'happy', say }, now);
  }

  wave(now: number, say?: SpeechKind): Directive {
    return this.set({ activity: 'wave', durationMs: DURATIONS.wave, mood: 'happy', say }, now);
  }
}
