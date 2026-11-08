// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_AVATARS, BUILTIN_PROFILES } from '../../characters';
import { DURATIONS } from '../../src/core/animation/brain';
import { DEFAULT_SETTINGS } from '../../src/core/settings/settings';
import { Companion } from '../../src/stage/companion';

let frames: Map<number, FrameRequestCallback>;
let serial: number;
let companion: Companion | undefined;

beforeEach(() => {
  serial = 0;
  frames = new Map();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(0);
  // Frames are controlled separately from timers to reproduce a timer firing
  // after the last displayed frame but before the next browser render.
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => { frames.set(++serial, frame); return serial; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
});

afterEach(() => {
  companion?.destroy();
  companion = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function frameAt(time: number) {
  vi.advanceTimersByTime(time - Date.now());
  const queued = [...frames.values()];
  frames.clear();
  for (const frame of queued) frame(time);
}

function start(entrance: 'peek' | 'pop' = 'pop') {
  const positions: { xRatio: number; yPx: number }[] = [];
  companion = new Companion({
    profile: BUILTIN_PROFILES[0]!, avatar: BUILTIN_AVATARS[0]!,
    settings: { ...DEFAULT_SETTINGS, gravity: true, chattiness: 'silent', reduceMotion: 'off' },
    memory: { lastGreetingAt: 0, recent: [] },
    now: () => Date.now(), rng: () => 0.5, entrance,
    callbacks: { saveMemory() {}, savePosition: (position) => positions.push(position), openSettings() {}, placeName: () => '' },
  }).mount();
  return { companion, positions, actor: companion.shadow.querySelector<HTMLElement>('.pc-actor')!, hit: companion.shadow.querySelector<HTMLElement>('.pc-hit')! };
}

function pointer(target: HTMLElement, type: string, x: number, y: number) {
  target.dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, clientX: x, clientY: y, bubbles: true }));
}

describe('stage trajectory completion between animation frames', () => {
  it('lands visibly and saves y=0 when the fall timer runs before the last frame', () => {
    const { companion, positions, actor, hit } = start();
    const startX = companion.x + 50;
    pointer(hit, 'pointerdown', startX, 750);
    pointer(hit, 'pointermove', 400, 300);
    expect(companion.activity).toBe('dragging');
    expect(companion.y).toBeGreaterThan(400);
    pointer(hit, 'pointerup', 400, 300);
    expect(companion.activity).toBe('falling');
    const duration = companion.brain.remaining(Date.now());
    frameAt(duration - 16);
    expect(companion.y).toBeGreaterThan(10);
    const floatingTransform = actor.style.transform;

    // Deliberately do not deliver the final rAF. The independent directive
    // timeout must finish the old path before it publishes the idle state.
    vi.advanceTimersByTime(16);
    expect(companion.activity).toBe('idle');
    expect(companion.y).toBe(0);
    expect(actor.style.transform).not.toBe(floatingTransform);
    expect(actor.style.transform).toBe(`translate3d(${Math.round(companion.x)}px, 0px, 0)`);
    expect(positions.at(-1)?.yPx).toBe(0);
    expect(frames.size).toBeGreaterThan(0); // Next render has not run yet.
  });

  it('finishes a peek entrance at the floor before publishing the wave state', () => {
    const { companion, actor } = start('peek');
    frameAt(DURATIONS.entering - 16);
    expect(companion.y).not.toBe(0);
    const previousTransform = actor.style.transform;
    vi.advanceTimersByTime(16);
    expect(companion.activity).toBe('wave');
    expect(companion.y).toBe(0);
    expect(actor.style.transform).not.toBe(previousTransform);
    expect(actor.style.transform).toBe(`translate3d(${Math.round(companion.x)}px, 0px, 0)`);
  });
});

describe('host-executed desktop walks', () => {
  it('uses the desktop world for brain decisions without translating the actor off its compact web scene', () => {
    const walk = vi.fn((_directive: { targetX?: number }) => true);
    companion = new Companion({
      profile: BUILTIN_PROFILES[0]!, avatar: BUILTIN_AVATARS[0]!,
      settings: { ...DEFAULT_SETTINGS, chattiness: 'silent', reduceMotion: 'off' },
      memory: { lastGreetingAt: 0, recent: [] }, now: () => Date.now(), rng: () => .5, entrance: 'pop',
      callbacks: { saveMemory() {}, savePosition() {}, openSettings() {}, placeName: () => '',
        walkWorld: () => ({ x: 2000, minX: 0, maxX: 3000 }), walkOutside: walk },
    }).mount();
    const x = companion.x;
    vi.advanceTimersByTime(15000);
    expect(walk).toHaveBeenCalled();
    const directive = walk.mock.calls[0]?.[0] as unknown as { targetX: number };
    expect(directive.targetX).toBeGreaterThan(1200);
    expect(companion.x).toBe(x);
  });
});
