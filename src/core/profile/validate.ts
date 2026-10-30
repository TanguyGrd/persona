import { clamp } from '../rng';
import {
  ENTRANCES, LANGUAGES, SPEECH_KINDS, TIME_SLOTS, TONES,
  type CharacterProfile, type Language, type PhraseOverrides, type Tone,
} from './types';

export interface ValidationResult<T> {
  value: T;
  /** Human-readable notes about fields that were missing or corrected. */
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const num01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : fallback);

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

const MAX_LINES = 50;
const MAX_LINE = 280;

function lines(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((x) => str(x, MAX_LINE)).filter((x): x is string => !!x);
  return out.length ? out.slice(0, MAX_LINES) : undefined;
}

export function normalizePhrases(v: unknown): PhraseOverrides {
  if (!isObj(v)) return {};
  const out: PhraseOverrides = {};
  for (const kind of SPEECH_KINDS) {
    if (kind === 'greeting') {
      const g = v.greeting;
      if (Array.isArray(g)) {
        const l = lines(g);
        if (l) out.greeting = { any: l };
      } else if (isObj(g)) {
        const greeting: NonNullable<PhraseOverrides['greeting']> = {};
        for (const slot of [...TIME_SLOTS, 'any'] as const) {
          const l = lines(g[slot]);
          if (l) greeting[slot] = l;
        }
        if (Object.keys(greeting).length) out.greeting = greeting;
      }
      continue;
    }
    const l = lines(v[kind]);
    if (l) out[kind] = l;
  }
  return out;
}

/**
 * Turns untrusted input (storage, imported file) into a valid profile.
 * Never throws for recoverable problems: it fills defaults and reports warnings.
 */
export function normalizeProfile(input: unknown, now = Date.now()): ValidationResult<CharacterProfile> {
  const warnings: string[] = [];
  const src = isObj(input) ? input : {};
  if (!isObj(input)) warnings.push('Profil illisible : valeurs par défaut utilisées.');

  const name = str(src.name, 40) || 'Compagnon';
  if (!str(src.name, 40)) warnings.push('Nom manquant : « Compagnon » utilisé.');

  let language: Language = 'fr';
  if (LANGUAGES.includes(src.language as Language)) language = src.language as Language;
  else warnings.push(`Langue « ${String(src.language ?? '')} » non prise en charge : français utilisé.`);

  let tone: Tone = 'cheerful';
  if (TONES.includes(src.tone as Tone)) tone = src.tone as Tone;
  else warnings.push(`Ton « ${String(src.tone ?? '')} » inconnu : « cheerful » utilisé.`);

  const t = isObj(src.traits) ? src.traits : {};
  const traits = { energy: num01(t.energy, 0.5), sociability: num01(t.sociability, 0.5), playfulness: num01(t.playfulness, 0.5) };

  const entrance = src.entrance === 'random' || ENTRANCES.includes(src.entrance as never)
    ? (src.entrance as CharacterProfile['entrance'])
    : 'random';

  const m = isObj(src.meta) ? src.meta : {};
  const source = ['builtin', 'manual', 'imported', 'generated'].includes(m.source as string)
    ? (m.source as CharacterProfile['meta']['source'])
    : 'manual';
  const meta: CharacterProfile['meta'] = {
    source,
    createdAt: typeof m.createdAt === 'number' ? m.createdAt : now,
    updatedAt: typeof m.updatedAt === 'number' ? m.updatedAt : now,
  };
  if (typeof m.confidence === 'number') meta.confidence = clamp(m.confidence, 0, 1);
  const unc = lines(m.uncertainties);
  if (unc) meta.uncertainties = unc;
  const gen = str(m.generator, 60);
  if (gen) meta.generator = gen;
  const credits = str(m.credits, 500);
  if (credits) meta.credits = credits;

  const value: CharacterProfile = {
    schemaVersion: 1,
    id: str(src.id, 80) || newId('profile'),
    name,
    bio: str(src.bio, 600) ?? '',
    language,
    tone,
    traits,
    entrance,
    phrases: normalizePhrases(src.phrases),
    avatarId: str(src.avatarId, 80) || 'builtin:pip',
    meta,
  };
  return { value, warnings };
}
