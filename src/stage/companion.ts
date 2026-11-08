import { Brain, type Directive, type World } from '../core/animation/brain';
import { clipFor, type AvatarAsset } from '../core/avatar/types';
import { composeLine, planGreeting, remember, type SpeechMemory } from '../core/profile/speech';
import type { CharacterProfile, Entrance, SpeechKind } from '../core/profile/types';
import { clamp, type Rng } from '../core/rng';
import { FREQUENCY_FACTOR, type Settings } from '../core/settings/settings';
import { createAvatarView, type AvatarView } from './avatarView';
import { Bubble } from './bubble';
import { resolveUiLang, t, type UiLang } from './i18n';
import { STAGE_CSS } from './styles';

/**
 * The web stage: puts one character on top of a page and lets it live there.
 * Shared by the Chrome Host (content script, extension pages) and the future Windows Host
 * (a transparent web view). Only depends on the DOM and on the callbacks it is given.
 */

export interface CompanionCallbacks {
  /** Persist speech memory (greeting cooldown, recent lines). */
  saveMemory(memory: SpeechMemory): void;
  /** Persist the position after the user moved the character or it walked. */
  savePosition(pos: { xRatio: number; yPx: number }): void;
  openSettings(): void;
  /** Host name shown in some lines ("{site}"). */
  placeName(): string;
  /** Called after the user hid the character (for the host to track state). */
  onHiddenChange?(hidden: boolean): void;
}

export interface CompanionOptions {
  profile: CharacterProfile;
  avatar: AvatarAsset;
  settings: Settings;
  memory: SpeechMemory;
  callbacks: CompanionCallbacks;
  rng?: Rng;
  now?: () => number;
  /** Where to attach the host element (default: <html>, so page body transforms do not matter). */
  parent?: HTMLElement;
  /** Override the entrance (e.g. "pop" when the user brings the character back). */
  entrance?: Entrance;
  /** Start hidden, showing only the restore button. */
  startHidden?: boolean;
  /** Marks the host element (e.g. "extension") so a host can find its own instances. */
  owner?: string;
  /** Optional host limit for a compact desktop scene; preserves the avatar aspect ratio. */
  maxAvatarWidth?: number;
}

interface Segment { t0: number; t1: number; x0: number; x1: number; y0: number; y1: number; arc: number; ease: 'linear' | 'out' | 'in' | 'inout' }

const EASE = {
  linear: (p: number) => p,
  out: (p: number) => 1 - (1 - p) * (1 - p),
  in: (p: number) => p * p,
  inout: (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
};

const ICONS = {
  talk: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>',
  hide: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 8h9"/></svg>',
  settings: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4 5 11M11 5l1.4-1.4"/></svg>',
};

export const HOST_TAG = 'persona-companion';

export class Companion {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  readonly brain: Brain;
  private layer: HTMLDivElement;
  private actor: HTMLDivElement;
  private hit: HTMLDivElement;
  private flip: HTMLDivElement;
  private motionEl: HTMLDivElement;
  private restoreBtn: HTMLButtonElement;
  private bubble: Bubble;
  private view: AvatarView;
  private profile: CharacterProfile;
  private avatar: AvatarAsset;
  private settings: Settings;
  private memory: SpeechMemory;
  private cb: CompanionCallbacks;
  private rng: Rng;
  private now: () => number;
  private uiLang: UiLang;

  x = 0;
  y = 0;
  private w = 100;
  private h = 116;
  private facing: 1 | -1 = 1;
  private segments: Segment[] = [];
  private directiveStart = 0;
  private raf = 0;
  private stepTimer: ReturnType<typeof setTimeout> | undefined;
  private exitTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastUserActivity = 0;
  private pendingGreeting: SpeechKind | null = null;
  private drag: { id: number; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null = null;
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  private destroyed = false;
  private hiddenByUser = false;
  private reducedMotion = false;
  private pointer: { x: number; y: number } | null = null;

  constructor(private opts: CompanionOptions) {
    this.profile = opts.profile;
    this.avatar = opts.avatar;
    this.settings = opts.settings;
    this.memory = opts.memory;
    this.cb = opts.callbacks;
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now ?? (() => Date.now());
    this.uiLang = resolveUiLang(this.settings.uiLanguage);
    this.reducedMotion = this.computeReducedMotion();
    this.brain = new Brain({
      traits: this.profile.traits,
      rng: this.rng,
      frequency: FREQUENCY_FACTOR[this.settings.frequency],
      reducedMotion: this.reducedMotion,
      chatty: this.settings.chattiness === 'all',
    });

    const doc = (opts.parent ?? document.documentElement).ownerDocument;
    this.host = doc.createElement(HOST_TAG);
    if (opts.owner) this.host.dataset.owner = opts.owner;
    // CSSOM (not a style attribute) so strict page CSPs do not block it.
    this.host.style.cssText = 'all: initial; position: fixed; inset: 0 auto auto 0; width: 0; height: 0; z-index: 2147483646; pointer-events: none; display: block;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.injectStyles(doc);

    this.layer = doc.createElement('div');
    this.layer.className = 'pc-layer';
    this.actor = doc.createElement('div');
    this.actor.className = 'pc-actor';
    this.hit = doc.createElement('div');
    this.hit.className = 'pc-hit';
    this.hit.tabIndex = 0;
    this.hit.setAttribute('role', 'button');
    this.hit.setAttribute('aria-label', t(this.uiLang, 'companionLabel', { name: this.profile.name }));
    this.flip = doc.createElement('div');
    this.flip.className = 'pc-flip';
    this.motionEl = doc.createElement('div');
    this.motionEl.className = 'pc-motion';
    this.view = createAvatarView(this.avatar, doc);
    this.motionEl.appendChild(this.view.el);
    const fx = doc.createElement('div');
    fx.className = 'pc-fx';
    for (let i = 0; i < 3; i++) {
      const z = doc.createElement('span');
      z.className = 'pc-zzz';
      z.textContent = 'z';
      fx.appendChild(z);
    }
    this.motionEl.appendChild(fx);
    this.flip.appendChild(this.motionEl);
    this.hit.appendChild(this.flip);
    this.actor.append(this.hit, this.buildToolbar(doc));

    this.bubble = new Bubble(doc);
    this.bubble.onTypingChange = (typing) => this.view.setTalking(typing);

    this.restoreBtn = doc.createElement('button');
    this.restoreBtn.className = 'pc-restore';
    this.restoreBtn.hidden = true;
    this.restoreBtn.textContent = `▲ ${this.profile.name}`;
    this.restoreBtn.title = t(this.uiLang, 'restore', { name: this.profile.name });
    this.restoreBtn.setAttribute('aria-label', this.restoreBtn.title);
    this.restoreBtn.addEventListener('click', () => this.show());

    this.layer.append(this.actor, this.bubble.el, this.restoreBtn);
    this.shadow.appendChild(this.layer);
  }

  private injectStyles(doc: Document) {
    // Constructed stylesheets are not subject to the page's style-src CSP.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(STAGE_CSS);
      this.shadow.adoptedStyleSheets = [sheet];
      return;
    } catch { /* fall through */ }
    const style = doc.createElement('style');
    style.textContent = STAGE_CSS;
    this.shadow.appendChild(style);
  }

  private buildToolbar(doc: Document) {
    const bar = doc.createElement('div');
    bar.className = 'pc-toolbar';
    const mk = (key: 'talk' | 'hide' | 'settings', fn: () => void) => {
      const b = doc.createElement('button');
      b.className = 'pc-btn';
      b.dataset.action = key;
      b.title = t(this.uiLang, key);
      b.setAttribute('aria-label', b.title);
      b.innerHTML = ICONS[key];
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      bar.appendChild(b);
    };
    mk('talk', () => this.talk());
    mk('hide', () => this.hide());
    mk('settings', () => this.cb.openSettings());
    return bar;
  }

  private computeReducedMotion() {
    if (this.settings.reduceMotion === 'on') return true;
    if (this.settings.reduceMotion === 'off') return false;
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ---------------------------------------------------------------- geometry

  private get vw() { return this.host.ownerDocument.documentElement.clientWidth || window.innerWidth; }
  private get vh() { return window.innerHeight; }

  private world(): World {
    return { x: this.x, minX: 6, maxX: Math.max(6, this.vw - this.w - 6), userIdleMs: this.now() - this.lastUserActivity };
  }

  private measure() {
    this.h = Math.round(this.avatar.height * this.settings.scale);
    this.w = Math.round(this.h * this.view.aspect);
    const limit = this.opts.maxAvatarWidth;
    if (limit !== undefined && Number.isFinite(limit) && limit > 0 && this.w > limit) {
      this.h = Math.max(1, Math.round(this.h * limit / this.w));
      this.w = Math.round(limit);
    }
    this.actor.style.width = `${this.w}px`;
    this.actor.style.height = `${this.h}px`;
  }

  private restorePosition() {
    const w = this.world();
    const pos = this.settings.position;
    this.x = pos ? w.minX + pos.xRatio * (w.maxX - w.minX) : Math.max(w.minX, w.maxX - 48);
    this.y = pos && !this.settings.gravity ? clamp(pos.yPx, 0, this.vh - this.h) : 0;
  }

  private savePosition() {
    const w = this.world();
    const span = w.maxX - w.minX;
    this.cb.savePosition({ xRatio: span > 0 ? clamp((this.x - w.minX) / span, 0, 1) : 0.5, yPx: Math.round(this.y) });
  }

  // ---------------------------------------------------------------- lifecycle

  mount(): this {
    const parent = this.opts.parent ?? document.documentElement;
    parent.appendChild(this.host);
    this.measure();
    this.restorePosition();
    this.lastUserActivity = this.now();
    this.bindEvents();
    this.render();
    this.heartbeat = setInterval(() => this.step(), 1000);
    if (this.opts.startHidden) {
      this.hiddenByUser = true;
      this.actor.hidden = true;
      this.restoreBtn.hidden = false;
    } else {
      this.enter(this.opts.entrance);
    }
    return this;
  }

  private enter(forced?: Entrance) {
    const entrance = forced ?? (this.settings.entrance === 'profile' ? this.profile.entrance : this.settings.entrance);
    const cooldown = this.settings.greetCooldownMin * 60_000;
    this.pendingGreeting = this.settings.chattiness === 'silent' ? null : planGreeting(this.memory, this.now(), cooldown);
    this.apply(this.brain.enter(this.now(), entrance));
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.stepTimer);
    clearTimeout(this.exitTimer);
    clearInterval(this.heartbeat);
    for (const [target, type, fn, o] of this.listeners) target.removeEventListener(type, fn, o);
    this.listeners = [];
    this.bubble.destroy();
    this.view.destroy();
    this.host.remove();
  }

  get isHidden() { return this.hiddenByUser; }
  get activity() { return this.brain.activity; }

  /** Live settings changes that do not need a rebuild. */
  updateSettings(next: Settings) {
    const prev = this.settings;
    this.settings = next;
    this.reducedMotion = this.computeReducedMotion();
    this.layer.dataset.reduced = this.reducedMotion ? '1' : '';
    this.brain.configure({ frequency: FREQUENCY_FACTOR[next.frequency], reducedMotion: this.reducedMotion, chatty: next.chattiness === 'all' });
    if (prev.scale !== next.scale) {
      this.measure();
      this.x = clamp(this.x, this.world().minX, this.world().maxX);
    }
    if (!next.followCursor) this.view.lookAt(null);
    if (next.gravity && !prev.gravity && this.y > 2 && !this.hiddenByUser) this.apply(this.brain.release(this.now(), this.y, true));
    this.render();
  }

  hide() {
    if (this.hiddenByUser) return;
    this.hiddenByUser = true;
    this.cb.onHiddenChange?.(true);
    this.speak('bye');
    this.apply(this.brain.wave(this.now()));
    clearTimeout(this.exitTimer);
    this.exitTimer = setTimeout(() => this.apply(this.brain.exit(this.now())), 700);
  }

  show() {
    if (!this.hiddenByUser) return;
    this.hiddenByUser = false;
    clearTimeout(this.exitTimer);
    this.cb.onHiddenChange?.(false);
    this.restoreBtn.hidden = true;
    this.actor.hidden = false;
    this.restorePosition();
    this.enter(this.reducedMotion ? 'pop' : 'peek');
  }

  toggleHidden() {
    if (this.hiddenByUser) this.show();
    else this.hide();
  }

  /** Say something now (toolbar, popup). */
  talk(kind: SpeechKind = 'idle') {
    if (this.hiddenByUser) { this.show(); return; }
    const d = this.brain.talk(this.now(), kind);
    this.apply(d, true);
  }

  // ---------------------------------------------------------------- behaviour

  private step() {
    if (this.destroyed) return;
    // Removed from the page (e.g. the extension was reloaded and a fresh copy took over).
    if (!this.host.isConnected) { this.destroy(); return; }
    if (this.drag?.moved) return;
    const now = this.now();
    if (this.brain.activity === 'entering' && this.brain.remaining(now) <= 0) {
      const greet = this.pendingGreeting;
      this.pendingGreeting = null;
      this.apply(this.brain.wave(now, greet ?? undefined));
      this.showToolbar(4000);
      return;
    }
    const d = this.brain.tick(now, this.world());
    if (d) this.apply(d);
    else this.scheduleStep();
  }

  private scheduleStep() {
    clearTimeout(this.stepTimer);
    const left = this.brain.remaining(this.now());
    if (Number.isFinite(left)) this.stepTimer = setTimeout(() => this.step(), Math.max(16, left));
  }

  private apply(d: Directive, forceSpeech = false) {
    if (this.destroyed) return;
    const now = this.now();
    this.directiveStart = now;
    const a = this.actor.dataset;
    const prevActivity = a.activity;
    a.activity = d.activity;
    a.reaction = d.reaction ?? '';
    a.entrance = d.entrance ?? '';
    this.view.setClip(clipFor(d.activity, d.reaction));
    this.view.setMood(d.mood);
    this.segments = this.plan(d);

    if (d.activity === 'hidden') {
      this.actor.hidden = true;
      this.bubble.close();
      if (this.hiddenByUser) this.restoreBtn.hidden = false;
    } else {
      this.actor.hidden = false;
    }
    if (d.activity === 'entering' && d.entrance === 'pop') this.sparkle();
    if (prevActivity === 'falling' || (prevActivity === 'jump' && d.activity !== 'jump')) this.flash('land', 260);
    if (d.activity === 'jump') this.flash('launch', 180);
    if (prevActivity === 'walk' || prevActivity === 'falling') this.savePosition();
    if (d.activity === 'look' || d.activity === 'sleep') this.view.lookAt(null);

    if (d.say) this.speak(d.say, forceSpeech);
    this.startLoop();
    this.scheduleStep();
  }

  /** Motion path for a directive, in ms relative to its start. */
  private plan(d: Directive): Segment[] {
    const { x, y, h } = this;
    const seg = (t0: number, t1: number, x0: number, x1: number, y0: number, y1: number, arc = 0, ease: Segment['ease'] = 'linear'): Segment => ({ t0, t1, x0, x1, y0, y1, arc, ease });
    switch (d.activity) {
      case 'entering': {
        if (d.entrance === 'peek') {
          // Rise from behind the bottom edge of the window, look around, then hop out.
          return [
            seg(0, 650, x, x, -h * 1.02, -h * 0.45, 0, 'out'),
            seg(650, 1250, x, x, -h * 0.45, -h * 0.45),
            seg(1250, 1700, x, x, -h * 0.45, 0, h * 0.35, 'out'),
          ];
        }
        if (d.entrance === 'hop') {
          const fromLeft = x < this.vw / 2;
          const start = fromLeft ? -this.w - 10 : this.vw + 10;
          const mid = (start + x) / 2;
          return [seg(0, 850, start, mid, 0, 0, 70, 'linear'), seg(850, 1700, mid, x, 0, 0, 55, 'linear')];
        }
        return [];
      }
      case 'walk': {
        const tx = d.targetX ?? x;
        this.setFacing(tx < x ? -1 : 1);
        return [seg(0, d.durationMs, x, tx, y, y, 0, 'inout')];
      }
      case 'jump': {
        const drift = (this.rng() - 0.5) * 40;
        const tx = clamp(x + drift, this.world().minX, this.world().maxX);
        return [seg(0, d.durationMs, x, tx, y, y, 55 + 45 * this.brain.traits.energy, 'linear')];
      }
      case 'react':
        return d.reaction === 'hop' ? [seg(0, 520, x, x, y, y, 34, 'linear')] : [];
      case 'falling':
        return [seg(0, d.durationMs, x, x, y, 0, 0, 'in')];
      case 'exiting':
        return [seg(0, d.durationMs, x, x, y, -h * 1.05, 0, 'in')];
      default:
        return [];
    }
  }

  private setFacing(dir: 1 | -1) {
    this.facing = dir;
    const f = this.avatar.facing;
    const flip = f === 'front' ? false : (f === 'right') !== (dir === 1);
    this.flip.dataset.flip = flip ? '1' : '';
  }

  private flash(name: 'land' | 'launch', ms: number) {
    this.actor.dataset[name] = '1';
    setTimeout(() => { delete this.actor.dataset[name]; }, ms);
  }

  private sparkle() {
    if (this.reducedMotion) return;
    const doc = this.host.ownerDocument;
    for (let i = 0; i < 10; i++) {
      const s = doc.createElement('span');
      s.className = 'pc-spark';
      const angle = (i / 10) * Math.PI * 2;
      s.style.left = `${this.x + this.w / 2}px`;
      s.style.top = `${this.vh - this.y - this.h / 2}px`;
      s.style.setProperty('--dx', `${Math.cos(angle) * (50 + this.rng() * 30)}px`);
      s.style.setProperty('--dy', `${Math.sin(angle) * (50 + this.rng() * 30)}px`);
      s.style.background = ['#ffd166', '#06d6a0', '#ef476f', '#118ab2'][i % 4]!;
      this.layer.appendChild(s);
      setTimeout(() => s.remove(), 800);
    }
  }

  private speak(kind: SpeechKind, force = false) {
    const c = this.settings.chattiness;
    if (!force && (c === 'silent' || (c === 'greetings' && kind !== 'greeting' && kind !== 'again' && kind !== 'bye'))) return;
    const line = composeLine(kind, {
      profile: this.profile,
      now: new Date(this.now()),
      rng: this.rng,
      userName: this.settings.userName,
      site: this.cb.placeName(),
      recent: this.memory.recent,
    });
    if (!line) return;
    this.bubble.say(line.text, { reducedMotion: this.reducedMotion });
    this.memory = remember(this.memory, line, this.now(), kind === 'greeting' || kind === 'again');
    this.cb.saveMemory(this.memory);
    this.positionBubble();
  }

  // ---------------------------------------------------------------- rendering

  private startLoop() {
    cancelAnimationFrame(this.raf);
    const frame = () => {
      const moving = this.advance();
      this.render();
      if (moving && !this.destroyed) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Moves along the current path; returns true while there is motion left. */
  private advance(): boolean {
    if (!this.segments.length) return false;
    const t = this.now() - this.directiveStart;
    const seg = this.segments.find((s) => t < s.t1) ?? this.segments[this.segments.length - 1]!;
    const p = clamp((t - seg.t0) / Math.max(1, seg.t1 - seg.t0), 0, 1);
    const e = EASE[seg.ease](p);
    this.x = seg.x0 + (seg.x1 - seg.x0) * e;
    this.y = seg.y0 + (seg.y1 - seg.y0) * e + seg.arc * 4 * p * (1 - p);
    return t < this.segments[this.segments.length - 1]!.t1;
  }

  private render() {
    this.actor.style.transform = `translate3d(${Math.round(this.x)}px, ${Math.round(-this.y)}px, 0)`;
    this.positionBubble();
  }

  private positionBubble() {
    if (!this.bubble.isOpen) return;
    const el = this.bubble.el;
    const bw = el.offsetWidth || 200;
    const bh = el.offsetHeight || 40;
    const cx = this.x + this.w / 2;
    const left = clamp(cx - bw / 2, 8, Math.max(8, this.vw - bw - 8));
    const bottom = clamp(Math.max(this.y, 0) + this.h + 12, 8, Math.max(8, this.vh - bh - 8));
    el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(-bottom)}px, 0)`;
    el.style.setProperty('--tail', `${clamp(cx - left, 16, bw - 16)}px`);
  }

  // ---------------------------------------------------------------- input

  private on(target: EventTarget, type: string, fn: EventListener, o?: AddEventListenerOptions) {
    target.addEventListener(type, fn, o);
    this.listeners.push([target, type, fn, o]);
  }

  private bindEvents() {
    const win = this.host.ownerDocument.defaultView ?? window;
    const activity = () => {
      this.lastUserActivity = this.now();
      const d = this.brain.userActive(this.now());
      if (d) this.apply(d);
    };
    this.on(win, 'pointermove', ((e: PointerEvent) => {
      activity();
      this.pointer = { x: e.clientX, y: e.clientY };
      this.updateGaze();
    }) as EventListener, { passive: true });
    this.on(win, 'keydown', activity, { passive: true });
    this.on(win, 'scroll', activity, { passive: true, capture: true });
    this.on(win, 'resize', () => {
      // Paths belong to the old viewport. Keeping them would move the actor
      // outside a compact host again on its next animation frame.
      this.segments = [];
      this.x = clamp(this.x, this.world().minX, this.world().maxX);
      this.y = clamp(this.y, 0, Math.max(0, this.vh - this.h));
      this.render();
    });
    const doc = this.host.ownerDocument;
    this.on(doc, 'fullscreenchange', () => { this.layer.dataset.fullscreen = doc.fullscreenElement ? '1' : ''; });
    this.on(doc, 'visibilitychange', () => {
      if (doc.visibilityState === 'visible' && !this.hiddenByUser) this.scheduleStep();
    });

    this.on(this.hit, 'pointerdown', ((e: PointerEvent) => this.onPointerDown(e)) as EventListener);
    this.on(this.hit, 'pointermove', ((e: PointerEvent) => this.onPointerMove(e)) as EventListener);
    this.on(this.hit, 'pointerup', ((e: PointerEvent) => this.onPointerUp(e)) as EventListener);
    this.on(this.hit, 'pointercancel', ((e: PointerEvent) => this.onPointerUp(e, true)) as EventListener);
    this.on(this.hit, 'keydown', ((e: KeyboardEvent) => this.onKey(e)) as EventListener);
  }

  private updateGaze() {
    if (!this.settings.followCursor || !this.pointer) return;
    const act = this.brain.activity;
    if (act === 'look' || act === 'sleep' || act === 'hidden') return;
    const cx = this.x + this.w / 2;
    const cy = this.vh - this.y - this.h * 0.55;
    const dx = this.pointer.x - cx, dy = this.pointer.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dist / 160);
    this.view.lookAt({ x: (dx / dist) * k, y: (dy / dist) * k });
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    this.hit.setPointerCapture?.(e.pointerId);
    this.drag = { id: e.pointerId, dx: e.clientX - this.x, dy: this.vh - e.clientY - this.y, sx: e.clientX, sy: e.clientY, moved: false };
  }

  private onPointerMove(e: PointerEvent) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) {
      d.moved = true;
      this.segments = [];
      this.bubble.close();
      this.apply(this.brain.grab(this.now()));
    }
    if (!d.moved) return;
    this.x = clamp(e.clientX - d.dx, -this.w * 0.4, this.vw - this.w * 0.6);
    this.y = clamp(this.vh - e.clientY - d.dy, 0, Math.max(0, this.vh - this.h));
    this.render();
  }

  private onPointerUp(e: PointerEvent, cancelled = false) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    this.hit.releasePointerCapture?.(e.pointerId);
    if (d.moved) {
      this.x = clamp(this.x, this.world().minX, this.world().maxX);
      this.apply(this.brain.release(this.now(), this.y, this.settings.gravity));
      this.savePosition();
    } else if (!cancelled) {
      this.click();
    }
  }

  click() {
    const d = this.brain.click(this.now());
    if (d) this.apply(d);
    this.showToolbar(3000);
  }

  private toolbarTimer: ReturnType<typeof setTimeout> | undefined;
  /** Shows the hover toolbar for a while (touch screens, discoverability). */
  private showToolbar(ms: number) {
    this.actor.dataset.toolbar = '1';
    clearTimeout(this.toolbarTimer);
    this.toolbarTimer = setTimeout(() => { delete this.actor.dataset.toolbar; }, ms);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.click();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const w = this.world();
      this.x = clamp(this.x + (e.key === 'ArrowLeft' ? -24 : 24), w.minX, w.maxX);
      this.setFacing(e.key === 'ArrowLeft' ? -1 : 1);
      this.render();
      this.savePosition();
    }
  }
}
