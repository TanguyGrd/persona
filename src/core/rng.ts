/** Random source in [0, 1). Injected everywhere so behaviour is reproducible in tests. */
export type Rng = () => number;

/** Small deterministic PRNG (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error('pick() on empty list');
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

export function weightedPick<K extends string>(weights: Partial<Record<K, number>>, rng: Rng): K | null {
  const entries = Object.entries(weights).filter(([, w]) => typeof w === 'number' && w > 0) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r < 0) return k;
  }
  return entries[entries.length - 1]![0];
}

export function between(min: number, max: number, rng: Rng): number {
  return min + (max - min) * rng();
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
