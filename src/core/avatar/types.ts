import type { Activity, Reaction } from '../animation/brain';

/**
 * Avatar Assets — what the character looks like. Independent from the profile (who it is)
 * and from the engine (what it does). Every asset kind supports every activity: whole-body
 * motion (bob, squash, jump arcs, walking) is applied by the host, while richer kinds add
 * per-part (rigged SVG) or per-frame (sprite sheet) animation on top.
 */

export const AVATAR_CLIPS = ['idle', 'walk', 'jump', 'wave', 'react', 'sleep', 'talk', 'dangle', 'fall', 'look', 'enter'] as const;
export type AvatarClip = (typeof AVATAR_CLIPS)[number];

export type Facing = 'front' | 'left' | 'right';

interface AvatarBase {
  id: string;
  name: string;
  /** Which way the drawing faces; side-facing avatars are mirrored when walking the other way. */
  facing: Facing;
  /** Display height in CSS px at scale 1. */
  height: number;
  /** Author / licence notes. Keep them: they matter for commercial distribution. */
  credits?: string;
  license?: string;
  builtin?: boolean;
}

/** Vector avatar. When `rigged`, named parts (data-part="…") are animated individually. */
export interface SvgAvatar extends AvatarBase {
  kind: 'svg';
  /** Sanitised SVG markup. */
  svg: string;
  rigged: boolean;
}

/** A single picture: PNG, JPEG, WebP, GIF (animated GIF/WebP frames are played when supported). */
export interface ImageAvatar extends AvatarBase {
  kind: 'image';
  dataUrl: string;
  mime: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface FrameRect { x: number; y: number; w: number; h: number; durationMs?: number }

export interface SpriteClip { frames: number[]; fps: number; loop: boolean }

/** A sprite sheet: one image plus frame rectangles and named clips. */
export interface SpriteAvatar extends AvatarBase {
  kind: 'spritesheet';
  dataUrl: string;
  mime: string;
  frames: FrameRect[];
  clips: Partial<Record<AvatarClip, SpriteClip>>;
}

export type AvatarAsset = SvgAvatar | ImageAvatar | SpriteAvatar;

/** Which avatar clip best shows an activity. */
export function clipFor(activity: Activity, reaction?: Reaction): AvatarClip {
  switch (activity) {
    case 'entering': return 'enter';
    case 'walk': return 'walk';
    case 'jump': return 'jump';
    case 'wave': return 'wave';
    case 'talk': return 'talk';
    case 'look': return 'look';
    case 'react': return reaction === 'hop' ? 'jump' : 'react';
    case 'waking': return 'react';
    case 'dragging': return 'dangle';
    case 'falling': return 'fall';
    case 'sleep': return 'sleep';
    default: return 'idle';
  }
}

/** Fallback chain when a sprite sheet lacks a clip. */
export const CLIP_FALLBACK: Record<AvatarClip, AvatarClip[]> = {
  idle: [],
  walk: ['idle'],
  jump: ['react', 'idle'],
  wave: ['react', 'talk', 'idle'],
  react: ['jump', 'idle'],
  sleep: ['idle'],
  talk: ['idle'],
  dangle: ['fall', 'react', 'idle'],
  fall: ['dangle', 'jump', 'idle'],
  look: ['idle'],
  enter: ['wave', 'jump', 'idle'],
};

export function resolveClip(available: Partial<Record<AvatarClip, unknown>>, wanted: AvatarClip): AvatarClip | null {
  if (available[wanted]) return wanted;
  for (const c of CLIP_FALLBACK[wanted]) if (available[c]) return c;
  const first = Object.keys(available)[0] as AvatarClip | undefined;
  return first ?? null;
}
