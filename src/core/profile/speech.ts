import { PHRASEBOOK, type ToneLines } from './phrasebook';
import { weightedPick, pick, type Rng } from '../rng';
import type { CharacterProfile, SpeechKind, TimeSlot } from './types';

/** Local, rule-based line selection. Free: no network and no model. */

export function timeSlot(date: Date): TimeSlot {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}

export interface SpeechVars {
  name: string;
  user?: string;
  site?: string;
  day: string;
  time: string;
}

/** Fills a template; returns null when it needs a value we do not have. */
export function fillTemplate(template: string, vars: SpeechVars): string | null {
  let missing = false;
  const out = template.replace(/\{(,?)(\w+)\}/g, (_m, comma: string, key: string) => {
    const v = (vars as unknown as Record<string, string | undefined>)[key];
    if (comma) return v ? `, ${v}` : '';
    if (!v) missing = true;
    return v ?? '';
  });
  return missing ? null : out;
}

export function lineKey(kind: SpeechKind, template: string): string {
  let h = 0;
  for (let i = 0; i < template.length; i++) h = (Math.imul(h, 31) + template.charCodeAt(i)) | 0;
  return `${kind}:${(h >>> 0).toString(36)}`;
}

export interface SpeechContext {
  profile: CharacterProfile;
  now: Date;
  rng: Rng;
  userName?: string;
  site?: string;
  /** Keys of recently said lines, to avoid repeating ourselves. */
  recent?: readonly string[];
}

export interface Line {
  text: string;
  key: string;
}

type Tier = 'custom' | 'tone' | 'weekend' | 'default';
const TIER_WEIGHT: Record<Tier, number> = { custom: 3, tone: 2, weekend: 1, default: 1.2 };

function toneTier(lines: ToneLines | undefined, tone: CharacterProfile['tone']) {
  return { tone: lines?.[tone] ?? [], default: lines?.default ?? [] };
}

/** Candidate templates for a situation, grouped by where they come from. */
export function candidateTiers(kind: SpeechKind, profile: CharacterProfile, now: Date): Record<Tier, string[]> {
  const book = PHRASEBOOK[profile.language] ?? PHRASEBOOK.en;
  if (kind === 'greeting') {
    const slot = timeSlot(now);
    const custom = [...(profile.phrases.greeting?.[slot] ?? []), ...(profile.phrases.greeting?.any ?? [])];
    const weekendDay = now.getDay() === 0 || now.getDay() === 6;
    const w = weekendDay && slot !== 'night' ? toneTier(book.weekend, profile.tone) : { tone: [], default: [] };
    const g = toneTier(book.greeting[slot], profile.tone);
    return { custom, tone: g.tone, weekend: [...w.tone, ...w.default], default: g.default };
  }
  const t = toneTier(book[kind], profile.tone);
  const custom = profile.phrases[kind] ?? [];
  return { custom, tone: t.tone, weekend: [], default: t.default };
}

export function speechVars(ctx: SpeechContext): SpeechVars {
  const book = PHRASEBOOK[ctx.profile.language] ?? PHRASEBOOK.en;
  const hh = String(ctx.now.getHours()).padStart(2, '0');
  const mm = String(ctx.now.getMinutes()).padStart(2, '0');
  return {
    name: ctx.profile.name,
    user: ctx.userName?.trim() || undefined,
    site: ctx.site?.trim() || undefined,
    day: book.weekdays[ctx.now.getDay()] ?? '',
    time: `${hh}:${mm}`,
  };
}

/**
 * Picks a line for a situation. Prefers the profile's own lines, then lines matching its
 * tone, then generic ones; skips lines said recently and lines needing unknown values.
 */
export function composeLine(kind: SpeechKind, ctx: SpeechContext): Line | null {
  const tiers = candidateTiers(kind, ctx.profile, ctx.now);
  const vars = speechVars(ctx);
  const recent = new Set(ctx.recent ?? []);

  const usable = (tier: Tier, allowRecent: boolean) =>
    tiers[tier]
      .map((tpl) => ({ tpl, key: lineKey(kind, tpl), text: fillTemplate(tpl, vars) }))
      .filter((c): c is { tpl: string; key: string; text: string } => c.text !== null && (allowRecent || !recent.has(c.key)));

  // A known persona must not randomly fall back to an unrelated mascot line.
  const freshCustom = usable('custom', false);
  const custom = freshCustom.length ? freshCustom : usable('custom', true);
  if (custom.length) { const selected = pick(custom, ctx.rng); return { text: selected.text, key: selected.key }; }

  for (const allowRecent of [false, true]) {
    const weights: Partial<Record<Tier, number>> = {};
    for (const tier of Object.keys(TIER_WEIGHT) as Tier[]) {
      if (usable(tier, allowRecent).length) weights[tier] = TIER_WEIGHT[tier];
    }
    const tier = weightedPick(weights, ctx.rng);
    if (!tier) continue;
    const c = pick(usable(tier, allowRecent), ctx.rng);
    return { text: c.text, key: c.key };
  }
  return null;
}

/** What we remember between pages so greetings feel natural rather than spammy. */
export interface SpeechMemory {
  lastGreetingAt: number;
  recent: string[];
}

export const EMPTY_MEMORY: SpeechMemory = { lastGreetingAt: 0, recent: [] };
const RECENT_MAX = 16;

export function remember(memory: SpeechMemory, line: Line, now: number, isGreeting: boolean): SpeechMemory {
  const recent = [line.key, ...memory.recent.filter((k) => k !== line.key)].slice(0, RECENT_MAX);
  return { lastGreetingAt: isGreeting ? now : memory.lastGreetingAt, recent };
}

/**
 * How to greet when a page opens:
 * - "greeting": a full time-of-day greeting (first visit in a while),
 * - "again": a short "welcome back" (seen recently),
 * - null: no bubble, just a wave (pages opened in quick succession).
 */
export function planGreeting(memory: SpeechMemory, now: number, cooldownMs: number, quietMs = 90_000): 'greeting' | 'again' | null {
  const since = now - memory.lastGreetingAt;
  if (memory.lastGreetingAt <= 0 || since >= cooldownMs || since < 0) return 'greeting';
  if (since < quietMs) return null;
  return 'again';
}
