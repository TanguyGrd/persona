export type UiLang = 'fr' | 'en';

const STRINGS = {
  fr: {
    talk: 'Parler',
    hide: 'Masquer',
    settings: 'Réglages',
    restore: 'Faire revenir {name}',
    companionLabel: '{name}, ton compagnon. Entrée pour interagir, flèches pour déplacer.',
  },
  en: {
    talk: 'Talk',
    hide: 'Hide',
    settings: 'Settings',
    restore: 'Bring {name} back',
    companionLabel: '{name}, your companion. Enter to interact, arrow keys to move.',
  },
} as const;

export type UiKey = keyof (typeof STRINGS)['fr'];

export function resolveUiLang(pref: 'auto' | UiLang, navigatorLang = typeof navigator !== 'undefined' ? navigator.language : 'fr'): UiLang {
  if (pref !== 'auto') return pref;
  return navigatorLang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function t(lang: UiLang, key: UiKey, vars: Record<string, string> = {}): string {
  return STRINGS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}
