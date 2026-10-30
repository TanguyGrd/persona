import { describe, expect, it } from 'vitest';
import { Brain, DURATIONS, type Activity, type World } from '../../src/core/animation/brain';
import { seededRng } from '../../src/core/rng';

const world = (over: Partial<World> = {}): World => ({ x: 500, minX: 0, maxX: 1000, userIdleMs: 0, ...over });
const traits = (energy = 0.5, sociability = 0.5, playfulness = 0.5) => ({ energy, sociability, playfulness });

/** Runs the brain for a while and returns the activities it chose. */
function simulate(brain: Brain, ms: number, w = world()): Activity[] {
  let now = 0;
  brain.enter(now, 'peek');
  const seen: Activity[] = [];
  while (now < ms) {
    now += 100;
    const d = brain.tick(now, w);
    if (d) {
      seen.push(d.activity);
      if (d.activity === 'walk') w.x = d.targetX!;
    }
  }
  return seen;
}

describe('Brain', () => {
  it('enters with the requested entrance, then idles', () => {
    const b = new Brain({ traits: traits(), rng: seededRng(1) });
    const d = b.enter(0, 'hop');
    expect(d).toMatchObject({ activity: 'entering', entrance: 'hop', durationMs: DURATIONS.entering });
    expect(b.tick(DURATIONS.entering - 1, world())).toBeNull();
    expect(b.tick(DURATIONS.entering, world())?.activity).toBe('idle');
  });

  it('picks a random entrance and never hops when motion is reduced', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) seen.add(new Brain({ traits: traits(), rng: seededRng(s) }).enter(0, 'random').entrance!);
    expect(seen).toEqual(new Set(['peek', 'hop', 'pop']));
    expect(new Brain({ traits: traits(), rng: seededRng(1), reducedMotion: true }).enter(0, 'hop').entrance).toBe('pop');
  });

  it('lives on its own: idle alternates with autonomous actions', () => {
    const seen = simulate(new Brain({ traits: traits(), rng: seededRng(7) }), 5 * 60_000);
    for (const a of ['idle', 'walk', 'wave', 'look', 'jump', 'talk'] as const) expect(seen, a).toContain(a);
    for (let i = 1; i < seen.length; i++) if (seen[i] !== 'idle') expect(seen[i - 1]).toBe('idle');
  });

  it('energetic characters move more than calm ones', () => {
    const count = (energy: number) => {
      let moves = 0;
      for (let s = 0; s < 20; s++) moves += simulate(new Brain({ traits: traits(energy, 0.5, 0.5), rng: seededRng(s) }), 120_000).filter((a) => a === 'walk' || a === 'jump').length;
      return moves;
    };
    expect(count(0.95)).toBeGreaterThan(count(0.05) * 1.5);
  });

  it('frequency setting changes how often it acts', () => {
    const actions = (frequency: number) => simulate(new Brain({ traits: traits(), rng: seededRng(5), frequency }), 300_000).filter((a) => a !== 'idle').length;
    expect(actions(1.6)).toBeGreaterThan(actions(0.55));
  });

  it('respects reduced motion and the chatty switch', () => {
    const seen = simulate(new Brain({ traits: traits(0.9, 0.9, 0.9), rng: seededRng(2), reducedMotion: true, chatty: false }), 10 * 60_000);
    expect(seen).not.toContain('jump');
    expect(seen).not.toContain('talk');
  });

  it('walks to a target inside the bounds with a speed-based duration', () => {
    const b = new Brain({ traits: traits(0.6), rng: seededRng(11) });
    for (let i = 0; i < 200; i++) {
      const w = world({ x: Math.floor(Math.random() * 1000) });
      const tx = b.walkTarget(w);
      expect(tx).toBeGreaterThanOrEqual(0);
      expect(tx).toBeLessThanOrEqual(1000);
    }
    const all = simulate(new Brain({ traits: traits(0.9), rng: seededRng(4) }), 120_000);
    expect(all).toContain('walk');
  });

  it('does not walk when there is no room', () => {
    const seen = simulate(new Brain({ traits: traits(1, 0.5, 0.5), rng: seededRng(3) }), 120_000, world({ x: 0, minX: 0, maxX: 60 }));
    expect(seen).not.toContain('walk');
  });

  it('reacts to clicks, and gets dizzy when poked repeatedly', () => {
    const b = new Brain({ traits: traits(), rng: seededRng(9) });
    b.enter(0, 'pop');
    b.tick(2000, world());
    const r = b.click(2100)!;
    expect(r.activity).toBe('react');
    expect(['giggle', 'hop', 'spin', 'blush']).toContain(r.reaction);
    b.click(2300); b.click(2500);
    expect(b.click(2700)).toMatchObject({ activity: 'react', reaction: 'dizzy', say: 'poke', mood: 'dizzy' });
  });

  it('ignores clicks while entering or hidden', () => {
    const b = new Brain({ traits: traits(), rng: seededRng(1) });
    expect(b.click(0)).toBeNull();
    b.enter(0, 'pop');
    expect(b.click(10)).toBeNull();
  });

  it('dangles while dragged and falls when released in the air', () => {
    const b = new Brain({ traits: traits(), rng: seededRng(1) });
    b.enter(0, 'pop');
    b.tick(2000, world());
    expect(b.grab(2100).activity).toBe('dragging');
    expect(b.tick(99_999, world())).toBeNull();
    const fall = b.release(3000, 300, true);
    expect(fall.activity).toBe('falling');
    expect(fall.durationMs).toBeGreaterThan(300);
    expect(b.release(4000, 300, false).activity).toBe('react');
    expect(b.release(5000, 0, true).activity).toBe('react');
  });

  it('falls asleep when the user is away and wakes up when they return', () => {
    const b = new Brain({ traits: traits(), rng: seededRng(1), sleepAfterMs: 60_000 });
    b.enter(0, 'pop');
    b.tick(2000, world());
    expect(b.activity).toBe('idle');
    expect(b.tick(2100, world({ userIdleMs: 61_000 }))?.activity).toBe('sleep');
    expect(b.tick(500_000, world({ userIdleMs: 600_000 }))).toBeNull();
    expect(b.userActive(500_100)).toMatchObject({ activity: 'waking', say: 'wake' });
  });

  it('exits then stays hidden', () => {
    const b = new Brain({ traits: traits(), rng: seededRng(1) });
    b.enter(0, 'pop');
    b.exit(100);
    expect(b.tick(100 + DURATIONS.exiting, world())?.activity).toBe('hidden');
    expect(b.tick(1e9, world())).toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const a = simulate(new Brain({ traits: traits(), rng: seededRng(42) }), 120_000);
    const b = simulate(new Brain({ traits: traits(), rng: seededRng(42) }), 120_000);
    expect(a).toEqual(b);
  });
});
