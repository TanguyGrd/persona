import { normalizeSourceUrls } from '../profile/persona';
import { fileKind, importAvatarFiles, MAX_FILE_BYTES, exportPack, normalizeAvatar, type ImportDeps, type ImportFile, type PersonaPack } from '../avatar/importer';
import type { AvatarAsset } from '../avatar/types';
import { LocalProfileGenerator } from '../profile/generator';
import { newId } from '../profile/validate';
import type { CharacterProfile } from '../profile/types';
import { KEYS, type Repository } from '../settings/store';

export const MAX_REFERENCES = 10;
export const MAX_REFERENCE_BYTES = 32 * 1024 * 1024;
export const MAX_REFERENCE_SIDE = 8192;
export const MAX_REFERENCE_PIXELS = 16 * 1024 * 1024;

export interface PreparedReference {
  avatar: AvatarAsset;
  name: string;
  warnings: string[];
}

export async function prepareReferences(files: ImportFile[], deps: ImportDeps): Promise<PreparedReference[]> {
  if (!files.length || files.length > MAX_REFERENCES) throw new Error('Choisissez entre 1 et 10 images.');
  let total = 0;
  for (const file of files) {
    if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) throw new Error(`« ${file.name} » dépasse 8 Mo ou a une taille invalide.`);
    const kind = fileKind(file.name, file.mime);
    if (kind !== 'raster' && kind !== 'svg') throw new Error(`« ${file.name} » n’est pas une image prise en charge.`);
    if ((file.text?.length ?? 0) > MAX_FILE_BYTES || (file.dataUrl?.length ?? 0) > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 128) throw new Error(`« ${file.name} » dépasse 8 Mo.`);
    total += file.size;
  }
  if (total > MAX_REFERENCE_BYTES) throw new Error('Les images dépassent la limite totale de 32 Mo.');
  // A small compressed file can describe an enormous bitmap. Bound natural
  // dimensions before prepared assets reach the runtime and thumbnail views.
  const boundedDeps: ImportDeps = {
    imageSize: async (dataUrl) => {
      const size = await deps.imageSize(dataUrl);
      if (![size.w, size.h].every((side) => Number.isFinite(side) && side > 0 && side <= MAX_REFERENCE_SIDE)
        || size.w * size.h > MAX_REFERENCE_PIXELS) {
        throw new Error('Dimensions d’image trop grandes ou invalides : 8192 pixels par côté et 16 mégapixels maximum.');
      }
      return size;
    },
  };
  // Sequential preparation limits simultaneous decode memory and keeps selection order.
  const prepared: PreparedReference[] = [];
  for (const file of files) {
    const result = await importAvatarFiles([file], boundedDeps);
    prepared.push({ avatar: result.avatar, name: file.name.slice(0, 180), warnings: result.warnings });
  }
  return prepared;
}

export interface CreateCompanionRequest {
  references: PreparedReference[];
  primaryIndex: number;
  name?: string;
  universe?: string;
  description?: string;
  sourceUrls?: string[];
}

/** Creates a local instant companion. Selection of an active profile is a separate host action. */
export async function createCompanion(repo: Repository, request: CreateCompanionRequest): Promise<CharacterProfile> {
  const { references, primaryIndex } = request;
  const sourceUrls = normalizeSourceUrls(request.sourceUrls);
  if (!references.length || references.length > MAX_REFERENCES) throw new Error('Choisissez entre 1 et 10 images.');
  if (!Number.isInteger(primaryIndex) || primaryIndex < 0 || primaryIndex >= references.length) throw new Error('Choisissez une vue principale valide.');
  // Never overwrite assets from an earlier creation when reusing a prepared draft.
  const avatars = references.map(({ avatar }) => ({ ...normalizeAvatar(avatar), id: newId('avatar') }));
  const payloadBytes = avatars.reduce((sum, avatar) => {
    if (avatar.kind === 'svg') return sum + new TextEncoder().encode(avatar.svg).byteLength;
    const encoded = avatar.dataUrl.slice(avatar.dataUrl.indexOf(',') + 1);
    return sum + Math.max(0, Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0));
  }, 0);
  if (payloadBytes > MAX_REFERENCE_BYTES) throw new Error('Les images dépassent la limite totale de 32 Mo.');
  const generated = await new LocalProfileGenerator().generate({
    name: request.name?.trim().slice(0, 40) || 'Compagnon',
    description: request.description?.trim().slice(0, 600) || '',
    language: 'fr',
  });
  const profile = generated.profile;
  profile.avatarId = avatars[primaryIndex]!.id;
  if (sourceUrls.length) profile.meta.sourceUrls = sourceUrls;
  if (request.universe?.trim()) profile.universe = request.universe.trim().slice(0, 120);
  profile.meta.creation = { mode: 'instant', source: 'user', preparedAt: Date.now(), referenceAvatarIds: avatars.map((avatar) => avatar.id) };
  profile.meta.uncertainties = [...(profile.meta.uncertainties ?? []), 'Images de référence conservées localement ; aucune analyse visuelle, fusion de vues, articulation ou recherche IA effectuée.'];
  const written: string[] = [];
  try {
    for (const avatar of avatars) {
      await repo.saveAvatar(avatar);
      written.push(avatar.id);
    }
    return await repo.saveProfile(profile);
  } catch (error) {
    const cleanup = await Promise.allSettled(written.map((id) => repo.store.remove(KEYS.avatar(id))));
    if (cleanup.some((result) => result.status === 'rejected')) throw new AggregateError([error], 'Création interrompue ; certains fichiers temporaires n’ont pas pu être nettoyés.');
    throw error;
  }
}

export async function exportCompanionPack(repo: Repository, profileId: string): Promise<PersonaPack> {
  const profile = await repo.getProfile(profileId);
  if (!profile) throw new Error('Personnage introuvable.');
  const avatar = await repo.getAvatar(profile.avatarId);
  if (!avatar) throw new Error('Avatar principal introuvable.');
  const ids = (profile.meta.creation?.referenceAvatarIds ?? []).filter((id) => id !== avatar.id);
  const references: AvatarAsset[] = [];
  for (const id of ids) {
    const reference = await repo.getAvatar(id);
    if (!reference) throw new Error('Une image de référence est introuvable.');
    references.push(reference);
  }
  return exportPack(profile, avatar, references);
}

/** Contracts for later phases. No provider is called by instant creation. */
export interface IdentityResearchProvider {
  research(request: { name: string; universe?: string }, signal: AbortSignal): Promise<{
    sources: { url: string; title: string; accessedAt: number }[];
    candidates: { name: string; universe?: string; summary: string }[];
    uncertainties: string[];
  }>;
}
export interface AvatarPreparationProvider {
  prepare(request: { references: PreparedReference[]; primaryIndex: number }, signal: AbortSignal): Promise<{
    avatar: AvatarAsset; mode: 'instant' | 'articulated'; warnings: string[];
  }>;
}
