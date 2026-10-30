import { AVATAR_CLIPS, type AvatarClip, type FrameRect, type SpriteClip } from './types';

/**
 * Sprite sheet descriptors. Two formats are accepted:
 *  1. Persona grid:  { "format": "persona-spritesheet", "frameWidth": 64, "frameHeight": 64,
 *                      "animations": { "idle": { "frames": [0,1,2,3], "fps": 6 } } }
 *  2. Aseprite / TexturePacker JSON export (hash or array), with frame tags or
 *     frame names such as "walk_01.png".
 */

const SYNONYMS: Record<AvatarClip, string[]> = {
  idle: ['idle', 'stand', 'breathe', 'default', 'rest', 'repos', 'neutral'],
  walk: ['walk', 'walking', 'run', 'move', 'marche', 'courir'],
  jump: ['jump', 'hop', 'leap', 'saut', 'sauter'],
  wave: ['wave', 'hello', 'hi', 'greet', 'coucou', 'salut', 'bonjour'],
  react: ['react', 'reaction', 'hit', 'click', 'happy', 'laugh', 'surprise', 'poke'],
  sleep: ['sleep', 'nap', 'dodo', 'dormir', 'zzz'],
  talk: ['talk', 'speak', 'say', 'parle', 'parler'],
  dangle: ['dangle', 'drag', 'grab', 'hold', 'held', 'carry'],
  fall: ['fall', 'falling', 'drop', 'chute', 'tomber'],
  look: ['look', 'glance', 'regard', 'regarder'],
  enter: ['enter', 'appear', 'spawn', 'arrive', 'entree', 'entrée'],
};

export function clipFromName(name: string): AvatarClip | null {
  const n = name.toLowerCase().replace(/\.(png|webp|gif|jpe?g)$/, '').replace(/[\s_-]*\d+$/, '').trim();
  for (const clip of AVATAR_CLIPS) if (SYNONYMS[clip].includes(n)) return clip;
  for (const clip of AVATAR_CLIPS) if (SYNONYMS[clip].some((s) => n.startsWith(s))) return clip;
  return null;
}

export interface ParsedSprites {
  frames: FrameRect[];
  clips: Partial<Record<AvatarClip, SpriteClip>>;
  /** Image file name the descriptor refers to, if any. */
  image?: string;
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const posInt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function isSpriteDescriptor(json: unknown): boolean {
  if (!isObj(json)) return false;
  if (json.format === 'persona-spritesheet') return true;
  return 'frames' in json && isObj(json.meta);
}

function frameList(spec: unknown, count: number): number[] {
  if (Array.isArray(spec)) return spec.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < count);
  if (isObj(spec)) {
    const from = Number(spec.from), to = Number(spec.to);
    if (Number.isInteger(from) && Number.isInteger(to) && from <= to) {
      return Array.from({ length: to - from + 1 }, (_, k) => from + k).filter((i) => i < count);
    }
  }
  return [];
}

function parseGrid(json: Record<string, unknown>, image: { w: number; h: number }): ParsedSprites {
  const warnings: string[] = [];
  const fw = posInt(json.frameWidth), fh = posInt(json.frameHeight);
  if (!fw || !fh) throw new Error('frameWidth et frameHeight sont obligatoires.');
  const cols = posInt(json.columns) || Math.floor(image.w / fw);
  const rows = Math.floor(image.h / fh);
  if (!cols || !rows) throw new Error('L’image est plus petite qu’une frame.');
  const total = Math.min(posInt(json.frameCount) || cols * rows, cols * rows);
  const frames: FrameRect[] = Array.from({ length: total }, (_, i) => ({ x: (i % cols) * fw, y: Math.floor(i / cols) * fh, w: fw, h: fh }));

  const clips: ParsedSprites['clips'] = {};
  const anims = isObj(json.animations) ? json.animations : {};
  for (const [name, spec] of Object.entries(anims)) {
    const clip = clipFromName(name);
    if (!clip) { warnings.push(`Animation « ${name} » ignorée (nom inconnu).`); continue; }
    const s = isObj(spec) ? spec : {};
    const list = frameList(Array.isArray(spec) ? spec : s.frames ?? (s.from !== undefined ? s : undefined), total);
    if (!list.length) { warnings.push(`Animation « ${name} » sans frame valide.`); continue; }
    clips[clip] = { frames: list, fps: Math.min(60, posInt(s.fps) || 8), loop: s.loop !== false };
  }
  if (!Object.keys(clips).length) clips.idle = { frames: frames.map((_, i) => i), fps: 8, loop: true };
  return { frames, clips, image: typeof json.image === 'string' ? json.image : undefined, warnings };
}

function parseAseprite(json: Record<string, unknown>): ParsedSprites {
  const warnings: string[] = [];
  const meta = isObj(json.meta) ? json.meta : {};
  const named: { name: string; rect: FrameRect }[] = [];
  const toRect = (f: unknown): FrameRect | null => {
    if (!isObj(f) || !isObj(f.frame)) return null;
    const r = f.frame as Record<string, unknown>;
    const w = posInt(r.w), h = posInt(r.h);
    if (!w || !h) return null;
    return { x: Math.max(0, Number(r.x) || 0), y: Math.max(0, Number(r.y) || 0), w, h, durationMs: posInt(f.duration) || undefined };
  };
  if (Array.isArray(json.frames)) {
    json.frames.forEach((f, i) => {
      const rect = toRect(f);
      if (rect) named.push({ name: isObj(f) && typeof f.filename === 'string' ? f.filename : String(i), rect });
    });
  } else if (isObj(json.frames)) {
    for (const [name, f] of Object.entries(json.frames)) {
      const rect = toRect(f);
      if (rect) named.push({ name, rect });
    }
  }
  if (!named.length) throw new Error('Aucune frame lisible dans le JSON.');
  const frames = named.map((n) => n.rect);
  const fpsOf = (idx: number[]) => {
    const d = idx.map((i) => frames[i]?.durationMs ?? 100);
    return Math.min(60, Math.max(1, Math.round(1000 / (d.reduce((a, b) => a + b, 0) / d.length))));
  };

  const clips: ParsedSprites['clips'] = {};
  const tags = Array.isArray(meta.frameTags) ? meta.frameTags : [];
  for (const tag of tags) {
    if (!isObj(tag) || typeof tag.name !== 'string') continue;
    const clip = clipFromName(tag.name);
    if (!clip) { warnings.push(`Tag « ${tag.name} » ignoré (nom inconnu).`); continue; }
    let list = frameList({ from: tag.from, to: tag.to }, frames.length);
    if (tag.direction === 'reverse') list = list.reverse();
    if (tag.direction === 'pingpong') list = [...list, ...list.slice(1, -1).reverse()];
    if (list.length && !clips[clip]) clips[clip] = { frames: list, fps: fpsOf(list), loop: !['jump', 'enter', 'fall'].includes(clip) };
  }
  if (!tags.length) {
    // TexturePacker style: group by frame name prefix ("walk_01.png" → walk).
    const groups = new Map<AvatarClip, number[]>();
    named.forEach((n, i) => {
      const clip = clipFromName(n.name);
      if (clip) groups.set(clip, [...(groups.get(clip) ?? []), i]);
    });
    for (const [clip, list] of groups) clips[clip] = { frames: list, fps: fpsOf(list), loop: true };
  }
  if (!Object.keys(clips).length) {
    warnings.push('Aucun nom d’animation reconnu : toutes les frames servent d’animation de repos.');
    clips.idle = { frames: frames.map((_, i) => i), fps: fpsOf(frames.map((_, i) => i)), loop: true };
  }
  return { frames, clips, image: typeof meta.image === 'string' ? meta.image : undefined, warnings };
}

export function parseSpriteDescriptor(json: unknown, image: { w: number; h: number }): ParsedSprites {
  if (!isObj(json)) throw new Error('Descripteur de sprites invalide.');
  const parsed = json.format === 'persona-spritesheet' ? parseGrid(json, image) : parseAseprite(json);
  const outside = parsed.frames.filter((f) => f.x + f.w > image.w || f.y + f.h > image.h).length;
  if (outside) parsed.warnings.push(`${outside} frame(s) dépassent l’image.`);
  return parsed;
}
