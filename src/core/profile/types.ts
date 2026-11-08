/**
 * Character Profile — who the character is: identity, language, traits and phrases.
 * Contains no animation or rendering data; avatars are referenced by id only.
 */

export const LANGUAGES = ['fr', 'en', 'es', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];

export const TONES = ['cheerful', 'calm', 'playful', 'shy', 'grumpy'] as const;
export type Tone = (typeof TONES)[number];

export const TIME_SLOTS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

/** Situations in which the character may say something. */
export const SPEECH_KINDS = ['greeting', 'again', 'click', 'poke', 'idle', 'wake', 'drop', 'bye'] as const;
export type SpeechKind = (typeof SPEECH_KINDS)[number];

export const ENTRANCES = ['peek', 'hop', 'pop'] as const;
export type Entrance = (typeof ENTRANCES)[number];

/** Personality dials in [0, 1]. They drive how often and how the character moves and talks. */
export interface Traits {
  /** Calm ↔ energetic: walk/jump frequency and speed. */
  energy: number;
  /** Reserved ↔ talkative: how often it waves and talks. */
  sociability: number;
  /** Serious ↔ playful: spins, hops and silly reactions. */
  playfulness: number;
}

/** Custom lines. Greetings can be split by time slot; other kinds are flat lists. */
export interface PhraseOverrides {
  greeting?: Partial<Record<TimeSlot | 'any', string[]>>;
  again?: string[];
  click?: string[];
  poke?: string[];
  idle?: string[];
  wake?: string[];
  drop?: string[];
  bye?: string[];
}

export type ProfileSource = 'builtin' | 'manual' | 'imported' | 'generated';

/** Instant preparation provenance; never claims visual analysis or public research. */
export interface CharacterCreation {
  mode: 'instant';
  source: 'user';
  preparedAt: number;
  /** Includes the active view. Other views are references, not generated poses. */
  referenceAvatarIds: string[];
}

export interface ProfileMeta {
  source: ProfileSource;
  createdAt: number;
  updatedAt: number;
  /** How sure the generator was about the personality, 0..1 (generated profiles only). */
  confidence?: number;
  /** Things the generator could not establish and the user should check. */
  uncertainties?: string[];
  /** Which generator produced the profile, e.g. "local-heuristic@1". */
  generator?: string;
  /** Credit / licence notes for the character itself. */
  credits?: string;
  creation?: CharacterCreation;
}

export interface CharacterProfile {
  schemaVersion: 1;
  id: string;
  name: string;
  bio: string;
  /** User-provided universe; not a verified research result. */
  universe?: string;
  language: Language;
  tone: Tone;
  traits: Traits;
  entrance: Entrance | 'random';
  phrases: PhraseOverrides;
  /** Id of the Avatar Asset used to render this character. */
  avatarId: string;
  meta: ProfileMeta;
}
