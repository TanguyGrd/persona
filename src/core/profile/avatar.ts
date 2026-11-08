import type { CharacterProfile } from './types';

/** Replace the visible view while retaining the other user-provided references. */
export function replacePrimaryAvatar(profile: CharacterProfile, newAvatarId: string): CharacterProfile {
  const id = newAvatarId.trim().slice(0, 80);
  if (!id) throw new Error('Avatar principal invalide.');
  const next: CharacterProfile = { ...profile, avatarId: id, meta: { ...profile.meta } };
  const creation = profile.meta.creation;
  if (creation) {
    const refs = [...new Set(creation.referenceAvatarIds.map((reference) => reference === profile.avatarId ? id : reference))];
    if (!refs.includes(id)) refs.push(id);
    if (refs.length > 10) throw new Error('Le profil contient déjà 10 références sans vue principale identifiable.');
    next.meta.creation = { ...creation, referenceAvatarIds: refs };
  }
  return next;
}
