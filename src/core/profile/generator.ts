import { clamp } from '../rng';
import { newId, normalizeProfile } from './validate';
import { LANGUAGES, TONES, type CharacterProfile, type Language, type Tone, type Traits } from './types';

/**
 * Profile generation happens once, when a character is created; the result is cached and
 * then edited by hand. Today only a free local heuristic exists. An AI-backed generator
 * (paid tier, see Agent Interface) will implement the same interface later.
 */
export interface ProfileRequest {
  name: string;
  description: string;
  /** Forced language; detected from the description when omitted. */
  language?: Language;
}

export interface GeneratedProfile {
  profile: CharacterProfile;
  /** 0..1 — how much of the personality was actually established. */
  confidence: number;
  /** What could not be established. Shown to the user with an invitation to correct it. */
  uncertainties: string[];
}

export interface ProfileGenerator {
  readonly id: string;
  generate(req: ProfileRequest): Promise<GeneratedProfile>;
}

type Lexicon = Record<string, string[]>;

const TONE_WORDS: Record<Tone, string[]> = {
  cheerful: ['joyeu', 'gai', 'enjoué', 'souriant', 'optimiste', 'enthousiaste', 'solaire', 'happy', 'cheerful', 'joyful', 'sunny', 'bubbly', 'enthusiastic', 'optimistic', 'alegre', 'fröhlich'],
  calm: ['calme', 'serein', 'posé', 'doux', 'douce', 'zen', 'paisible', 'sage', 'tranquille', 'calm', 'gentle', 'serene', 'peaceful', 'wise', 'chill', 'tranquilo', 'ruhig'],
  playful: ['espiègle', 'farceu', 'malicieu', 'taquin', 'blagueu', 'drôle', 'rigolo', 'coquin', 'joueu', 'playful', 'mischievous', 'prankster', 'funny', 'silly', 'cheeky', 'juguet', 'verspielt'],
  shy: ['timide', 'réservé', 'discret', 'discrète', 'introverti', 'shy', 'timid', 'reserved', 'introvert', 'tímid', 'schüchtern'],
  grumpy: ['grognon', 'ronchon', 'bougon', 'râleu', 'sarcastique', 'cynique', 'grincheu', 'blasé', 'grumpy', 'sarcastic', 'cynical', 'cranky', 'tsundere', 'gruñón', 'mürrisch'],
};

const TRAIT_WORDS: Record<`${keyof Traits}${'+' | '-'}`, string[]> = {
  'energy+': ['énergique', 'dynamique', 'hyperacti', 'sporti', 'vif', 'vive', 'rapide', 'survolté', 'energetic', 'hyper', 'lively', 'active', 'fast', 'energétic', 'energisch'],
  'energy-': ['paresseu', 'lent', 'endormi', 'fatigué', 'flemmard', 'nonchalant', 'lazy', 'sleepy', 'slow', 'tired', 'perezos', 'faul'],
  'sociability+': ['bavard', 'sociable', 'extraverti', 'amical', 'chaleureu', 'affectueu', 'talkative', 'chatty', 'friendly', 'outgoing', 'warm', 'affectionate', 'hablador', 'gesprächig'],
  'sociability-': ['solitaire', 'silencieu', 'taciturne', 'froid', 'loner', 'silent', 'cold', 'callad'],
  'playfulness+': ['curieu', 'aventur', 'farfelu', 'fantaisiste', 'curious', 'adventurous', 'whimsical', 'curios', 'neugierig'],
  'playfulness-': ['sérieu', 'strict', 'formel', 'rigoureu', 'serious', 'stern', 'formal', 'seri', 'ernst'],
};

const STOPWORDS: Record<Language, string[]> = {
  fr: ['le', 'la', 'les', 'est', 'et', 'un', 'une', 'des', 'qui', 'avec', 'très', 'il', 'elle', 'du', 'aime', 'pour'],
  en: ['the', 'is', 'and', 'a', 'an', 'with', 'very', 'who', 'he', 'she', 'they', 'loves', 'likes', 'of', 'for'],
  es: ['el', 'los', 'es', 'y', 'muy', 'con', 'que', 'una', 'del', 'le', 'gusta', 'para'],
  de: ['der', 'die', 'das', 'und', 'ist', 'sehr', 'mit', 'ein', 'eine', 'er', 'sie', 'mag', 'für'],
};

function words(text: string): string[] {
  return text.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);
}

function countMatches(tokens: string[], stems: string[]): number {
  return tokens.filter((t) => stems.some((s) => t.startsWith(s))).length;
}

export function detectLanguage(text: string): { language: Language; sure: boolean } {
  const tokens = words(text);
  const scores = LANGUAGES.map((l) => ({ l, n: tokens.filter((t) => STOPWORDS[l].includes(t)).length }));
  scores.sort((a, b) => b.n - a.n);
  const [best, second] = scores;
  if (!best || best.n === 0) return { language: 'fr', sure: false };
  return { language: best.l, sure: best.n >= 2 && best.n > (second?.n ?? 0) };
}

export interface Analysis {
  tone: Tone | null;
  toneVotes: Record<Tone, number>;
  traits: Traits;
  traitEvidence: Record<keyof Traits, number>;
  matched: number;
}

export function analyzeDescription(text: string): Analysis {
  const tokens = words(text);
  const toneVotes = Object.fromEntries(TONES.map((t) => [t, countMatches(tokens, TONE_WORDS[t])])) as Record<Tone, number>;
  const ranked = [...TONES].sort((a, b) => toneVotes[b] - toneVotes[a]);
  const top = ranked[0]!;
  const tone = toneVotes[top] > 0 ? top : null;

  const base: Record<Tone, Traits> = {
    cheerful: { energy: 0.7, sociability: 0.8, playfulness: 0.6 },
    calm: { energy: 0.3, sociability: 0.5, playfulness: 0.3 },
    playful: { energy: 0.75, sociability: 0.7, playfulness: 0.9 },
    shy: { energy: 0.35, sociability: 0.25, playfulness: 0.4 },
    grumpy: { energy: 0.4, sociability: 0.35, playfulness: 0.25 },
  };
  const traits: Traits = { ...(tone ? base[tone] : { energy: 0.5, sociability: 0.5, playfulness: 0.5 }) };
  const traitEvidence: Record<keyof Traits, number> = { energy: 0, sociability: 0, playfulness: 0 };
  for (const key of ['energy', 'sociability', 'playfulness'] as const) {
    const plus = countMatches(tokens, TRAIT_WORDS[`${key}+`]) + (key === 'playfulness' ? toneVotes.playful : 0);
    const minus = countMatches(tokens, TRAIT_WORDS[`${key}-`]);
    traitEvidence[key] = plus + minus;
    traits[key] = clamp(traits[key] + 0.15 * plus - 0.15 * minus, 0.05, 0.95);
  }
  const matched = Object.values(toneVotes).reduce((a, b) => a + b, 0) + Object.values(traitEvidence).reduce((a, b) => a + b, 0);
  return { tone, toneVotes, traits, traitEvidence, matched };
}

const TRAIT_LABEL: Record<keyof Traits, string> = { energy: 'énergie', sociability: 'sociabilité', playfulness: 'espièglerie' };

/** Free generator: keyword rules on the user's description. No network access. */
export class LocalProfileGenerator implements ProfileGenerator {
  readonly id = 'local-heuristic@1';

  async generate(req: ProfileRequest): Promise<GeneratedProfile> {
    const name = req.name.trim() || 'Compagnon';
    const description = req.description.trim();
    const uncertainties: string[] = [
      `Aucune recherche en ligne n’a été faite. Si « ${name} » est un personnage existant, vérifiez que sa personnalité et sa façon de parler correspondent, puis corrigez-les à la main.`,
    ];

    const lang = req.language ? { language: req.language, sure: true } : detectLanguage(description);
    if (!lang.sure) {
      uncertainties.push(`Langue non précisée : « ${lang.language} » a été choisie d’après la description. Changez-la si besoin.`);
    }

    const a = analyzeDescription(description);
    if (!description) {
      uncertainties.push('Aucune description : personnalité neutre appliquée par défaut.');
    }
    if (!a.tone) {
      uncertainties.push('Ton de voix non identifié : « calm » (calme) utilisé par défaut.');
    } else {
      const tied = TONES.filter((t) => t !== a.tone && a.toneVotes[t] === a.toneVotes[a.tone!]);
      if (tied.length) uncertainties.push(`Ton ambigu entre « ${a.tone} » et « ${tied.join('», «')} » : vérifiez le ton choisi.`);
    }
    for (const key of ['energy', 'sociability', 'playfulness'] as const) {
      if (a.traitEvidence[key] === 0 && !a.tone) uncertainties.push(`Trait « ${TRAIT_LABEL[key]} » non déterminé : valeur moyenne appliquée.`);
    }

    const confidence = clamp(0.15 + 0.12 * a.matched + (lang.sure ? 0.1 : 0), 0, 0.9);
    const now = Date.now();
    const { value: profile } = normalizeProfile({
      name,
      bio: description,
      language: lang.language,
      tone: a.tone ?? 'calm',
      traits: a.traits,
      entrance: 'random',
      phrases: {},
      meta: { source: 'generated', createdAt: now, updatedAt: now, confidence, uncertainties, generator: this.id },
    });
    return { profile, confidence, uncertainties };
  }
}

/** Minimal key-value contract used for caching (see settings/store.ts). */
export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export function requestKey(gen: ProfileGenerator, req: ProfileRequest): string {
  const raw = `${gen.id}|${req.name.trim().toLowerCase()}|${req.language ?? ''}|${req.description.trim()}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(h, 31) + raw.charCodeAt(i)) | 0;
  return `profileCache:${(h >>> 0).toString(36)}`;
}

/** Generates once per distinct request, then serves the cached result (important for paid generators). */
export class CachedProfileGenerator implements ProfileGenerator {
  constructor(private inner: ProfileGenerator, private cache: CacheStore) {}
  get id() { return this.inner.id; }

  async generate(req: ProfileRequest): Promise<GeneratedProfile> {
    const key = requestKey(this.inner, req);
    const hit = await this.cache.get<GeneratedProfile>(key);
    if (hit) {
      const copy = structuredClone(hit);
      copy.profile.id = newId('profile');
      return copy;
    }
    const result = await this.inner.generate(req);
    await this.cache.set(key, result);
    return result;
  }
}
