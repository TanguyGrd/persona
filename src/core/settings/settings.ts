import { clamp } from '../rng';
import { ENTRANCES, type Entrance } from '../profile/types';

export type Frequency = 'calm' | 'normal' | 'lively';
export type Chattiness = 'all' | 'greetings' | 'silent';

export interface Settings {
  schemaVersion: 1;
  /** Master switch. When false nothing is injected into pages. */
  enabled: boolean;
  activeProfileId: string;
  /** Optional, used in greetings ("Bonjour, Tanguy !"). Stays on this device. */
  userName: string;
  uiLanguage: 'auto' | 'fr' | 'en';
  /** Character size multiplier. */
  scale: number;
  /** Fall back to the bottom of the window after being dropped. */
  gravity: boolean;
  frequency: Frequency;
  chattiness: Chattiness;
  /** Minutes before a full greeting is used again (shorter visits get a "welcome back"). */
  greetCooldownMin: number;
  entrance: 'profile' | 'random' | Entrance;
  followCursor: boolean;
  reduceMotion: 'auto' | 'on' | 'off';
  /** Host names where the companion never appears; "*.example.com" covers sub-domains. */
  disabledSites: string[];
  /** Last position: horizontal ratio of the free space and height above the floor. */
  position: { xRatio: number; yPx: number } | null;
}

export const BUILTIN_PROFILE_ID = 'builtin:pip';

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  enabled: true,
  activeProfileId: BUILTIN_PROFILE_ID,
  userName: '',
  uiLanguage: 'auto',
  scale: 1,
  gravity: true,
  frequency: 'normal',
  chattiness: 'all',
  greetCooldownMin: 30,
  entrance: 'profile',
  followCursor: true,
  reduceMotion: 'auto',
  disabledSites: [],
  position: null,
};

export const FREQUENCY_FACTOR: Record<Frequency, number> = { calm: 0.55, normal: 1, lively: 1.6 };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

export function normalizeHost(input: string): string {
  let h = input.trim().toLowerCase();
  if (!h) return '';
  h = h.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');
  return h.replace(/^www\./, '');
}

export function normalizeSettings(input: unknown): Settings {
  const s = isObj(input) ? input : {};
  const d = DEFAULT_SETTINGS;
  const pos = isObj(s.position) && typeof s.position.xRatio === 'number' && typeof s.position.yPx === 'number'
    ? { xRatio: clamp(s.position.xRatio, 0, 1), yPx: clamp(s.position.yPx, 0, 4000) }
    : null;
  const sites = Array.isArray(s.disabledSites)
    ? [...new Set(s.disabledSites.filter((x): x is string => typeof x === 'string').map(normalizeHost).filter(Boolean))].slice(0, 500)
    : [];
  return {
    schemaVersion: 1,
    enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
    activeProfileId: typeof s.activeProfileId === 'string' && s.activeProfileId ? s.activeProfileId : d.activeProfileId,
    userName: typeof s.userName === 'string' ? s.userName.trim().slice(0, 40) : '',
    uiLanguage: oneOf(s.uiLanguage, ['auto', 'fr', 'en'] as const, d.uiLanguage),
    scale: typeof s.scale === 'number' && Number.isFinite(s.scale) ? clamp(s.scale, 0.5, 2) : d.scale,
    gravity: typeof s.gravity === 'boolean' ? s.gravity : d.gravity,
    frequency: oneOf(s.frequency, ['calm', 'normal', 'lively'] as const, d.frequency),
    chattiness: oneOf(s.chattiness, ['all', 'greetings', 'silent'] as const, d.chattiness),
    greetCooldownMin: typeof s.greetCooldownMin === 'number' ? clamp(Math.round(s.greetCooldownMin), 1, 24 * 60) : d.greetCooldownMin,
    entrance: oneOf(s.entrance, ['profile', 'random', ...ENTRANCES] as const, d.entrance),
    followCursor: typeof s.followCursor === 'boolean' ? s.followCursor : d.followCursor,
    reduceMotion: oneOf(s.reduceMotion, ['auto', 'on', 'off'] as const, d.reduceMotion),
    disabledSites: sites,
    position: pos,
  };
}

/** True when the companion must not appear on this host. */
export function isSiteDisabled(settings: Pick<Settings, 'disabledSites'>, host: string): boolean {
  const h = normalizeHost(host);
  if (!h) return false;
  return settings.disabledSites.some((rule) => {
    if (rule.startsWith('*.')) {
      const base = rule.slice(2);
      return h === base || h.endsWith(`.${base}`);
    }
    return h === rule;
  });
}

export function toggleSite(settings: Settings, host: string, disabled: boolean): Settings {
  const h = normalizeHost(host);
  const rest = settings.disabledSites.filter((r) => r !== h);
  return { ...settings, disabledSites: disabled ? [...rest, h] : rest };
}
