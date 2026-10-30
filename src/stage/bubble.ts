/** Speech bubble with a typewriter effect. Positioned by the stage every frame. */
export class Bubble {
  readonly el: HTMLDivElement;
  private visible: HTMLSpanElement;
  private typed: HTMLSpanElement;
  private ghost: HTMLSpanElement;
  private sr: HTMLSpanElement;
  private typeTimer: ReturnType<typeof setInterval> | undefined;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;
  onTypingChange: (typing: boolean) => void = () => {};

  constructor(doc: Document) {
    this.el = doc.createElement('div');
    this.el.className = 'pc-bubble';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    this.visible = doc.createElement('span');
    this.visible.setAttribute('aria-hidden', 'true');
    // The untyped rest is laid out but invisible, so the bubble has its final size at once.
    this.typed = doc.createElement('span');
    this.ghost = doc.createElement('span');
    this.ghost.className = 'pc-ghost';
    this.visible.append(this.typed, this.ghost);
    this.sr = doc.createElement('span');
    this.sr.className = 'pc-sr';
    this.sr.setAttribute('aria-live', 'polite');
    this.el.append(this.visible, this.sr);
    this.el.addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
  }

  get isOpen() { return !this.el.hidden; }
  get text() { return this.sr.textContent ?? ''; }

  /** Shows a line; returns how long it will stay on screen (ms). */
  say(text: string, opts: { reducedMotion?: boolean } = {}): number {
    this.clear();
    this.el.hidden = false;
    this.sr.textContent = text;
    const chars = Array.from(text);
    this.typed.textContent = '';
    this.ghost.textContent = text;
    requestAnimationFrame(() => { this.el.dataset.open = '1'; });
    if (opts.reducedMotion) {
      this.typed.textContent = text;
      this.ghost.textContent = '';
    } else {
      let i = 0;
      this.onTypingChange(true);
      this.typeTimer = setInterval(() => {
        i += 1;
        this.typed.textContent = chars.slice(0, i).join('');
        this.ghost.textContent = chars.slice(i).join('');
        if (i >= chars.length) {
          clearInterval(this.typeTimer);
          this.typeTimer = undefined;
          this.onTypingChange(false);
        }
      }, 28);
    }
    const stay = Math.min(8000, 2200 + chars.length * 55);
    this.closeTimer = setTimeout(() => this.close(), stay);
    return stay;
  }

  private clear() {
    if (this.typeTimer) { clearInterval(this.typeTimer); this.onTypingChange(false); }
    this.typeTimer = undefined;
    clearTimeout(this.closeTimer);
  }

  close() {
    this.clear();
    delete this.el.dataset.open;
    this.el.hidden = true;
    this.typed.textContent = '';
    this.ghost.textContent = '';
    this.sr.textContent = '';
  }

  destroy() {
    this.clear();
    this.el.remove();
  }
}
