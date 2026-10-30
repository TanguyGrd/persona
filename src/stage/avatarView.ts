import type { Mood } from '../core/animation/brain';
import { resolveClip, type AvatarAsset, type AvatarClip, type FrameRect, type ImageAvatar, type SpriteAvatar, type SvgAvatar } from '../core/avatar/types';

/** Renders one Avatar Asset. Whole-body motion is handled by the stage around it. */
export interface AvatarView {
  readonly el: HTMLElement;
  /** width / height */
  readonly aspect: number;
  setClip(clip: AvatarClip): void;
  setMood(mood: Mood): void;
  setTalking(on: boolean): void;
  /** Direction to look at, each axis in -1..1; null to look straight ahead. */
  lookAt(dir: { x: number; y: number } | null): void;
  destroy(): void;
}

export function createAvatarView(asset: AvatarAsset, doc: Document = document): AvatarView {
  switch (asset.kind) {
    case 'svg': return new SvgView(asset, doc);
    case 'image': return new RasterView(asset, doc);
    case 'spritesheet': return new RasterView(asset, doc);
  }
}

function svgAspect(markup: string): number {
  const m = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(markup);
  const w = Number(m?.[1]), h = Number(m?.[2]);
  return w > 0 && h > 0 ? w / h : 1;
}

class SvgView implements AvatarView {
  readonly el: HTMLElement;
  readonly aspect: number;
  private pupils: SVGElement[] = [];
  private blinkTimer: ReturnType<typeof setTimeout> | undefined;
  private mouthTimer: ReturnType<typeof setInterval> | undefined;
  private destroyed = false;

  constructor(asset: SvgAvatar, doc: Document) {
    this.el = doc.createElement('div');
    this.el.className = 'pc-avatar';
    this.aspect = svgAspect(asset.svg);
    // Markup is sanitised at import time; parsing as XML never executes scripts.
    const parsed = new DOMParser().parseFromString(asset.svg, 'image/svg+xml').documentElement;
    const svg = doc.importNode(parsed, true) as unknown as SVGSVGElement;
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    this.el.appendChild(svg);
    if (asset.rigged) {
      for (const part of Array.from(svg.querySelectorAll<SVGElement>('[data-origin]'))) {
        part.style.transformOrigin = part.getAttribute('data-origin') ?? '50% 50%';
      }
      this.pupils = Array.from(svg.querySelectorAll<SVGElement>('[data-part^="pupil-"]'));
      this.scheduleBlink();
    }
    this.setClip('idle');
  }

  private scheduleBlink() {
    this.blinkTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.el.dataset.blink = '1';
      setTimeout(() => { delete this.el.dataset.blink; }, 140);
      this.scheduleBlink();
    }, 2200 + Math.random() * 4200);
  }

  setClip(clip: AvatarClip) { this.el.dataset.clip = clip; }
  setMood(mood: Mood) { this.el.dataset.mood = mood; }

  setTalking(on: boolean) {
    clearInterval(this.mouthTimer);
    this.mouthTimer = undefined;
    delete this.el.dataset.mouth;
    if (!on) return;
    let open = false;
    this.mouthTimer = setInterval(() => {
      open = !open;
      if (open) this.el.dataset.mouth = 'open';
      else delete this.el.dataset.mouth;
    }, 120);
  }

  lookAt(dir: { x: number; y: number } | null) {
    const x = dir ? dir.x * 3.2 : 0;
    const y = dir ? dir.y * 2.6 : 0;
    for (const p of this.pupils) p.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.blinkTimer);
    clearInterval(this.mouthTimer);
    this.el.remove();
  }
}

interface Frame { bitmap: ImageBitmap | null; rect: FrameRect; durationMs: number }

/** Decodes a data URL without fetching it, so page Content-Security-Policies do not block it. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'application/octet-stream';
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(o: { frameIndex: number }): Promise<{ image: { duration: number | null; displayWidth: number; displayHeight: number; close(): void } & CanvasImageSource }>;
  close(): void;
}

/** Static images, animated GIF/WebP and sprite sheets, drawn on a canvas. */
class RasterView implements AvatarView {
  readonly el: HTMLElement;
  readonly aspect: number;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private sheet: ImageBitmap | null = null;
  private frames: Frame[] = [];
  private clip: AvatarClip = 'idle';
  private frameIdx = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  constructor(private asset: ImageAvatar | SpriteAvatar, doc: Document) {
    this.el = doc.createElement('div');
    this.el.className = 'pc-avatar';
    this.canvas = doc.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    if (asset.kind === 'spritesheet') {
      const w = Math.max(...asset.frames.map((f) => f.w)), h = Math.max(...asset.frames.map((f) => f.h));
      this.aspect = w / h || 1;
      this.canvas.width = w;
      this.canvas.height = h;
    } else {
      this.aspect = asset.naturalWidth && asset.naturalHeight ? asset.naturalWidth / asset.naturalHeight : 1;
      this.canvas.width = asset.naturalWidth || 256;
      this.canvas.height = asset.naturalHeight || 256;
    }
    const pixelArt = this.canvas.height * 2 <= asset.height;
    if (this.ctx) this.ctx.imageSmoothingEnabled = !pixelArt;
    if (pixelArt) this.canvas.style.imageRendering = 'pixelated';
    void this.load();
  }

  private async load() {
    const blob = dataUrlToBlob(this.asset.dataUrl);
    try {
      if (this.asset.kind === 'image' && /gif|webp/.test(this.asset.mime) && 'ImageDecoder' in globalThis) {
        const frames = await this.decodeAnimated(blob);
        if (frames.length > 1) {
          this.frames = frames;
          this.play();
          return;
        }
      }
      this.sheet = await createImageBitmap(blob);
      if (this.destroyed) return;
      if (this.asset.kind === 'image') {
        this.frames = [{ bitmap: this.sheet, rect: { x: 0, y: 0, w: this.sheet.width, h: this.sheet.height }, durationMs: Infinity }];
        this.canvas.width = this.sheet.width;
        this.canvas.height = this.sheet.height;
        if (this.ctx) this.ctx.imageSmoothingEnabled = !(this.canvas.height * 2 <= this.asset.height);
      }
      this.play();
    } catch {
      this.el.dataset.error = '1';
    }
  }

  private async decodeAnimated(blob: Blob): Promise<Frame[]> {
    const Ctor = (globalThis as unknown as { ImageDecoder: new (o: { data: ReadableStream | ArrayBuffer; type: string }) => ImageDecoderLike }).ImageDecoder;
    const dec = new Ctor({ data: await blob.arrayBuffer(), type: blob.type });
    await dec.tracks.ready;
    const count = Math.min(200, dec.tracks.selectedTrack?.frameCount ?? 1);
    const frames: Frame[] = [];
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      const bitmap = await createImageBitmap(image);
      frames.push({ bitmap, rect: { x: 0, y: 0, w: bitmap.width, h: bitmap.height }, durationMs: Math.max(20, (image.duration ?? 100_000) / 1000) });
      image.close();
    }
    dec.close();
    return frames;
  }

  private currentSequence(): { frames: Frame[]; loop: boolean } {
    if (this.asset.kind === 'image' || !this.sheet) return { frames: this.frames, loop: true };
    const sprite = this.asset;
    const name = resolveClip(sprite.clips, this.clip);
    const c = name ? sprite.clips[name] : undefined;
    if (!c) return { frames: [], loop: true };
    const dur = 1000 / c.fps;
    return {
      frames: c.frames.map((i) => ({ bitmap: this.sheet, rect: sprite.frames[i]!, durationMs: sprite.frames[i]?.durationMs ?? dur })),
      loop: c.loop,
    };
  }

  private play() {
    clearTimeout(this.timer);
    if (this.destroyed) return;
    const seq = this.currentSequence();
    if (!seq.frames.length) return;
    const idx = seq.loop ? this.frameIdx % seq.frames.length : Math.min(this.frameIdx, seq.frames.length - 1);
    const f = seq.frames[idx]!;
    this.draw(f);
    if (seq.frames.length > 1 && (seq.loop || idx < seq.frames.length - 1)) {
      this.timer = setTimeout(() => { this.frameIdx++; this.play(); }, f.durationMs);
    }
  }

  private draw(f: Frame) {
    if (!this.ctx || !f.bitmap) return;
    const { width: cw, height: ch } = this.canvas;
    this.ctx.clearRect(0, 0, cw, ch);
    // Bottom-centre each frame so feet stay on the floor whatever the frame size.
    const dx = Math.round((cw - f.rect.w) / 2), dy = ch - f.rect.h;
    this.ctx.drawImage(f.bitmap, f.rect.x, f.rect.y, f.rect.w, f.rect.h, dx, dy, f.rect.w, f.rect.h);
  }

  setClip(clip: AvatarClip) {
    this.el.dataset.clip = clip;
    if (clip === this.clip) return;
    this.clip = clip;
    this.frameIdx = 0;
    if (this.asset.kind === 'spritesheet') this.play();
  }

  setMood(mood: Mood) { this.el.dataset.mood = mood; }
  setTalking(_on: boolean) {}
  lookAt(_dir: { x: number; y: number } | null) {}

  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.el.remove();
  }
}
