import { importAvatarFiles, MAX_FILE_BYTES, MAX_PACK_BYTES, type ImportDeps, type ImportFile } from '../../core/avatar/importer';
import { AVATAR_CLIPS, type AvatarAsset } from '../../core/avatar/types';
import { MAX_REFERENCE_PIXELS, MAX_REFERENCE_SIDE, createCompanion } from '../../core/creation/character';
import { KEYS, type Repository } from '../../core/settings/store';

/** Validate before an imported pack can allocate canvases or start frame timers. */
export async function validateAnimatedAsset(asset: AvatarAsset, deps: ImportDeps): Promise<void> {
  if (asset.kind === 'svg') return; // Importer has already sanitised markup.
  const size = await deps.imageSize(asset.dataUrl);
  if (![size.w, size.h].every((n) => Number.isInteger(n) && n > 0 && n <= MAX_REFERENCE_SIDE) || size.w * size.h > MAX_REFERENCE_PIXELS) throw new Error('Dimensions d’image invalides : 8192 pixels par côté et 16 mégapixels maximum.');
  if (asset.kind === 'image') { asset.naturalWidth = size.w; asset.naturalHeight = size.h; return; }
  if (!asset.frames.length || asset.frames.length > 512) throw new Error('Choisissez une animation de 1 à 512 frames.');
  for (const frame of asset.frames) {
    if (!frame || ![frame.x, frame.y, frame.w, frame.h].every(Number.isFinite) || frame.x < 0 || frame.y < 0 || frame.w < 1 || frame.h < 1 || frame.x + frame.w > size.w || frame.y + frame.h > size.h || (frame.durationMs !== undefined && (!Number.isFinite(frame.durationMs) || frame.durationMs < 1 || frame.durationMs > 60_000))) throw new Error('Une frame sort de la planche ou a des dimensions/durée invalides.');
  }
  const clips = Object.entries(asset.clips);
  if (!clips.length || clips.some(([name, clip]) => !AVATAR_CLIPS.includes(name as typeof AVATAR_CLIPS[number]) || !clip || !Array.isArray(clip.frames) || !clip.frames.length || clip.frames.length > 2048 || clip.frames.some((index: number) => !Number.isInteger(index) || index < 0 || index >= asset.frames.length) || !Number.isFinite(clip.fps) || clip.fps <= 0 || clip.fps > 60 || typeof clip.loop !== 'boolean')) throw new Error('Clips d’animation invalides.');
}

export async function importAnimatedCompanion(repo: Repository, files: ImportFile[], deps: ImportDeps) {
  if (files.length < 1 || files.length > 2 || files.filter((f) => f.name.toLowerCase().endsWith('.json')).length !== 1) throw new Error('Choisissez un pack .persona.json seul, ou une image avec son JSON d’animation.');
  if (files.some((f) => f.size > (f.name.toLowerCase().endsWith('.json') ? MAX_PACK_BYTES : MAX_FILE_BYTES))) throw new Error('Le fichier dépasse la limite autorisée.');
  const imported = await importAvatarFiles(files, { imageSize: async (url) => {
    const size = await deps.imageSize(url);
    if (size.w > MAX_REFERENCE_SIDE || size.h > MAX_REFERENCE_SIDE || size.w * size.h > MAX_REFERENCE_PIXELS) throw new Error('Image trop grande.');
    return size;
  } });
  const assets = [imported.avatar, ...(imported.references ?? [])];
  for (const asset of assets) await validateAnimatedAsset(asset, deps);
  if (imported.profile && files.length !== 1) throw new Error('Importez le pack Persona seul, sans fichier supplémentaire.');
  if (!imported.profile) {
    if (imported.avatar.kind !== 'spritesheet') throw new Error('Ce JSON ne décrit pas une animation.');
    const profile = await createCompanion(repo, { references: [{ avatar: imported.avatar, name: imported.avatar.name, warnings: imported.warnings }], primaryIndex: 0 });
    return { ...imported, profile };
  }
  const written: string[] = [];
  try {
    for (const asset of assets) { await repo.saveAvatar(asset); written.push(asset.id); }
    const profile = await repo.saveProfile(imported.profile);
    return { ...imported, profile };
  } catch (error) {
    await Promise.allSettled(written.map((id) => repo.store.remove(KEYS.avatar(id))));
    throw error;
  }
}
