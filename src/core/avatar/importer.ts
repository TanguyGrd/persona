import { newId, normalizeProfile } from '../profile/validate';
import type { CharacterProfile } from '../profile/types';
import { sanitizeSvg } from './svgSanitize';
import { isSpriteDescriptor, parseSpriteDescriptor } from './sprites';
import type { AvatarAsset, Facing, ImageAvatar, SpriteAvatar, SvgAvatar } from './types';

/** A user-picked file, already read by the host (data URL for binaries, text for SVG/JSON). */
export interface ImportFile {
  name: string;
  mime: string;
  size: number;
  dataUrl?: string;
  text?: string;
}

export interface ImportDeps {
  /** Natural size of an image data URL. */
  imageSize(dataUrl: string): Promise<{ w: number; h: number }>;
}

export interface ImportResult {
  avatar: AvatarAsset;
  /** Present when a full Persona pack was imported. */
  profile?: CharacterProfile;
  warnings: string[];
  /** Additional reference views in an extended v1 pack, excluding the primary avatar. */
  references?: AvatarAsset[];
}

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_PACK_BYTES = 48 * 1024 * 1024;
const RASTER_MIME = /^image\/(png|jpeg|gif|webp)$/;
const RASTER_DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,/;

export type FileKind = 'raster' | 'svg' | 'json' | 'unknown';

export function fileKind(name: string, mime: string): FileKind {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (mime === 'image/svg+xml' || ext === 'svg') return 'svg';
  if (RASTER_MIME.test(mime) || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'raster';
  if (mime === 'application/json' || ext === 'json') return 'json';
  return 'unknown';
}

function mimeOf(f: ImportFile): string {
  if (RASTER_MIME.test(f.mime)) return f.mime;
  const ext = f.name.toLowerCase().split('.').pop();
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png';
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Avatar';

function svgAvatar(markup: string, name: string, warnings: string[]): SvgAvatar {
  const s = sanitizeSvg(markup);
  if (s.removed.length) warnings.push(`Éléments retirés du SVG pour la sécurité : ${[...new Set(s.removed)].slice(0, 8).join(', ')}.`);
  if (!s.rigged) warnings.push('SVG sans parties animables (data-part) : il sera animé comme une image entière.');
  return { id: newId('avatar'), kind: 'svg', name: baseName(name), svg: s.svg, rigged: s.rigged, facing: 'front', height: 120 };
}

const PACK_FORMAT = 'persona-pack';

export interface PersonaPack {
  format: typeof PACK_FORMAT;
  version: 1;
  profile: CharacterProfile;
  avatar: AvatarAsset;
  /** Optional backwards-compatible reference images; the primary avatar still renders on older hosts. */
  references?: AvatarAsset[];
}

export function exportPack(profile: CharacterProfile, avatar: AvatarAsset, references: AvatarAsset[] = []): PersonaPack {
  if (references.length > 9) throw new Error('Un pack ne peut contenir plus de 10 vues.');
  const strip = (asset: AvatarAsset): AvatarAsset => {
    const { builtin: _b, ...rest } = asset;
    return rest as AvatarAsset;
  };
  const pack: PersonaPack = { format: PACK_FORMAT, version: 1, profile: { ...profile, meta: { ...profile.meta, source: 'imported' } }, avatar: strip(avatar) };
  if (references.length) pack.references = references.map(strip);
  if (new TextEncoder().encode(JSON.stringify(pack)).byteLength > MAX_PACK_BYTES) throw new Error('Le pack dépasse 48 Mo.');
  return pack;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates an avatar coming from storage or a pack. Re-sanitises SVG markup. */
export function normalizeAvatar(input: unknown, warnings: string[] = []): AvatarAsset {
  if (!isObj(input)) throw new Error('Avatar illisible.');
  if (typeof input.svg === 'string' && new TextEncoder().encode(input.svg).byteLength > MAX_FILE_BYTES) throw new Error('SVG d’avatar trop volumineux.');
  if (typeof input.dataUrl === 'string' && input.dataUrl.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 128) throw new Error('Image d’avatar trop volumineuse.');
  const facing: Facing = input.facing === 'left' || input.facing === 'right' ? input.facing : 'front';
  const height = typeof input.height === 'number' && input.height >= 40 && input.height <= 400 ? input.height : 120;
  const base = {
    id: typeof input.id === 'string' && input.id ? input.id.slice(0, 80) : newId('avatar'),
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 40) : 'Avatar',
    facing,
    height,
    credits: typeof input.credits === 'string' ? input.credits.slice(0, 500) : undefined,
    license: typeof input.license === 'string' ? input.license.slice(0, 200) : undefined,
  };
  if (input.kind === 'svg' && typeof input.svg === 'string') {
    const s = svgAvatar(input.svg, base.name, warnings);
    return { ...s, ...base };
  }
  if ((input.kind === 'image' || input.kind === 'spritesheet') && typeof input.dataUrl === 'string') {
    if (!RASTER_DATA_URL.test(input.dataUrl)) throw new Error('Image d’avatar dans un format non pris en charge.');
    const mime = input.dataUrl.slice(5, input.dataUrl.indexOf(';'));
    if (input.kind === 'image') {
      return { ...base, kind: 'image', dataUrl: input.dataUrl, mime, naturalWidth: Number(input.naturalWidth) || 0, naturalHeight: Number(input.naturalHeight) || 0 };
    }
    if (!Array.isArray(input.frames) || !isObj(input.clips)) throw new Error('Sprite sheet incomplète.');
    return { ...base, kind: 'spritesheet', dataUrl: input.dataUrl, mime, frames: input.frames as SpriteAvatar['frames'], clips: input.clips as SpriteAvatar['clips'] };
  }
  throw new Error(`Type d’avatar « ${String(input.kind)} » non pris en charge.`);
}

/**
 * Accepts, in order of precedence:
 *  - a Persona pack (.json with format "persona-pack"): profile + avatar,
 *  - a sprite sheet: one image + one descriptor JSON (Persona grid or Aseprite/TexturePacker),
 *  - a single SVG (rigged or not),
 *  - a single PNG / JPEG / WebP / GIF.
 */
export async function importAvatarFiles(files: ImportFile[], deps: ImportDeps): Promise<ImportResult> {
  const warnings: string[] = [];
  if (!files.length) throw new Error('Aucun fichier sélectionné.');
  for (const f of files) {
    const limit = fileKind(f.name, f.mime) === 'json' ? MAX_PACK_BYTES : MAX_FILE_BYTES;
    if (!Number.isFinite(f.size) || f.size < 0 || f.size > limit || (f.text && new TextEncoder().encode(f.text).byteLength > limit)) throw new Error(`« ${f.name} » dépasse ${limit / 1024 / 1024} Mo ou a une taille invalide.`);
  }
  const jsons = files.filter((f) => fileKind(f.name, f.mime) === 'json');
  const rasters = files.filter((f) => fileKind(f.name, f.mime) === 'raster');
  const svgs = files.filter((f) => fileKind(f.name, f.mime) === 'svg');

  for (const j of jsons) {
    let data: unknown;
    try { data = JSON.parse(j.text ?? ''); } catch { throw new Error(`« ${j.name} » n’est pas un JSON valide.`); }
    if (isObj(data) && data.format === PACK_FORMAT) {
      if (data.version !== 1) throw new Error('Version du pack Persona non prise en charge.');
      if (data.references !== undefined && (!Array.isArray(data.references) || data.references.length > 9)) throw new Error('Un pack ne peut contenir plus de 10 vues.');
      const avatar = normalizeAvatar(data.avatar, warnings);
      const identities = new Map<string, string>();
      identities.set(avatar.id, newId('avatar'));
      avatar.id = identities.get(avatar.id)!;
      const references: AvatarAsset[] = [];
      for (const raw of (data.references ?? []) as unknown[]) {
        const reference = normalizeAvatar(raw, warnings);
        if (identities.has(reference.id)) throw new Error('Le pack contient des identifiants d’avatar dupliqués.');
        identities.set(reference.id, newId('avatar'));
        reference.id = identities.get(reference.id)!;
        references.push(reference);
      }
      const { value: profile, warnings: pw } = normalizeProfile(data.profile);
      warnings.push(...pw);
      profile.id = newId('profile');
      profile.avatarId = avatar.id;
      profile.meta = { ...profile.meta, source: 'imported', updatedAt: Date.now() };
      if (profile.meta.creation) {
        const remapped = profile.meta.creation.referenceAvatarIds.flatMap((id) => identities.has(id) ? [identities.get(id)!] : []);
        profile.meta.creation.referenceAvatarIds = [...new Set([avatar.id, ...remapped, ...references.map((reference) => reference.id)])];
      } else if (references.length) {
        profile.meta.creation = { mode: 'instant', source: 'user', preparedAt: Date.now(), referenceAvatarIds: [avatar.id, ...references.map((reference) => reference.id)] };
      }
      return { avatar, profile, warnings, ...(references.length ? { references } : {}) };
    }
    if (isSpriteDescriptor(data)) {
      const img = rasters[0];
      if (!img?.dataUrl) throw new Error('Sélectionnez aussi l’image de la sprite sheet (PNG/WebP) avec le JSON.');
      const size = await deps.imageSize(img.dataUrl);
      const parsed = parseSpriteDescriptor(data, size);
      warnings.push(...parsed.warnings);
      const maxH = Math.max(...parsed.frames.map((f) => f.h));
      const avatar: SpriteAvatar = {
        id: newId('avatar'), kind: 'spritesheet', name: baseName(img.name), dataUrl: img.dataUrl, mime: mimeOf(img),
        frames: parsed.frames, clips: parsed.clips, facing: isObj(data) && (data.facing === 'left' || data.facing === 'right') ? data.facing : 'front',
        height: Math.min(200, Math.max(80, maxH)),
      };
      return { avatar, warnings };
    }
    throw new Error(`« ${j.name} » n’est ni un pack Persona ni une sprite sheet reconnue.`);
  }

  const svg = svgs[0];
  if (svg) return { avatar: svgAvatar(svg.text ?? '', svg.name, warnings), warnings };

  const img = rasters[0];
  if (img?.dataUrl) {
    if (!RASTER_DATA_URL.test(img.dataUrl)) throw new Error('Format d’image non pris en charge.');
    const size = await deps.imageSize(img.dataUrl);
    if (!size.w || !size.h) throw new Error('Image illisible.');
    const avatar: ImageAvatar = {
      id: newId('avatar'), kind: 'image', name: baseName(img.name), dataUrl: img.dataUrl, mime: mimeOf(img),
      naturalWidth: size.w, naturalHeight: size.h, height: Math.min(180, Math.max(80, size.h)), facing: 'front',
    };
    return { avatar, warnings };
  }
  throw new Error('Format non reconnu. Formats acceptés : PNG, JPEG, WebP, GIF, SVG, sprite sheet (+ JSON), pack .json.');
}
