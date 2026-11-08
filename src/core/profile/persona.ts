import type { CharacterProfile } from './types';

/** Original local lines, selected explicitly by the user. Not an AI identification result. */
export function applyTerryPersona(profile: CharacterProfile): CharacterProfile {
  return {
    ...structuredClone(profile),
    name: 'Terry McGinnis', universe: 'Batman Beyond / Batman, la relève',
    language: 'fr', tone: 'calm', entrance: 'peek',
    traits: { energy: 0.8, sociability: 0.45, playfulness: 0.45 },
    phrases: {
      greeting: { any: ['Salut{,user}. On commence ?', 'Me voilà. Une chose à la fois.'] },
      again: ['Toujours là.', 'On reprend ?'],
      click: ['Oui ?', 'J’ai compris. Pas besoin d’insister.'],
      poke: ['Doucement. Même la combinaison a ses limites.'],
      idle: ['Un plan simple, ça marche aussi.', 'Je reste dans le coin.'],
      wake: ['Je suis là. Qu’est-ce qu’on fait ?'],
      drop: ['Ça va. On reprend.'], bye: ['À tout à l’heure.', 'Je te laisse un peu d’espace.'],
    },
    meta: { ...profile.meta, source: 'manual', updatedAt: Date.now(), dialoguePreset: 'terry-mcginnis-fr@1',
      uncertainties: ['Identité choisie par l’utilisateur. Répliques locales originales, sans reconnaissance d’image ni conversation IA. Aucun pouvoir n’est exécuté par ce profil.'] },
  };
}

export function normalizeSourceUrls(input: unknown): string[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > 5) throw new Error('Ajoutez au maximum 5 liens de référence.');
  return [...new Set(input.map((value) => {
    if (typeof value !== 'string' || value.length > 2048) throw new Error('Lien de référence invalide.');
    let url: URL;
    try { url = new URL(value.trim()); } catch { throw new Error('Utilisez un lien HTTPS complet, par exemple une page Wikipédia.'); }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || /^[0-9.]+$/.test(host) || host.includes(':') || host.endsWith('.localhost') || host.endsWith('.local') || (url.port && url.port !== '443')) throw new Error('Utilisez un lien HTTPS public sans identifiant.');
    return url.href;
  }))];
}
