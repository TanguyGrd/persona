import type { CharacterProfile } from '../../src/core/profile/types';

/** Pip — the original demo character shipped with Persona. Free to use in the product. */
export const PIP_PROFILE: CharacterProfile = {
  schemaVersion: 1,
  id: 'builtin:pip',
  name: 'Pip',
  bio: 'Un petit esprit-pousse curieux, né dans un pot de basilic. Il adore les pages colorées, les promenades le long de la fenêtre et les clics affectueux.',
  language: 'fr',
  tone: 'playful',
  traits: { energy: 0.7, sociability: 0.8, playfulness: 0.85 },
  entrance: 'peek',
  phrases: {
    greeting: {
      morning: ['Pssst… Bonjour{,user} ! Ma feuille a poussé d’un millimètre cette nuit !', 'Bonjour ! J’ai pris un grand bol de lumière, je suis en pleine forme !'],
      afternoon: ['Coucou{,user} ! Un rayon de soleil et je repars !', 'Salut ! On se balade sur cette page ?'],
      evening: ['Bonsoir{,user} ! Je replie doucement mes feuilles…', 'Bonsoir ! Encore un peu de lumière d’écran ?'],
      night: ['Il est {time}… même les pousses dorment, normalement !', 'Chut, les autres plantes dorment. Coucou{,user} !'],
    },
    click: ['Hihi, ma feuille !', 'Ça chatouille les racines !', 'Je pousse plus vite quand on me fait coucou !'],
    idle: ['Je fais de la photosynthèse avec ton écran.', 'Un peu d’eau, et je pourrais grimper jusqu’en haut de la page !'],
    bye: ['Je retourne dans mon pot !'],
  },
  avatarId: 'builtin:pip',
  meta: { source: 'builtin', createdAt: 0, updatedAt: 0, credits: 'Personnage original Persona — conçu pour ce projet.' },
};
