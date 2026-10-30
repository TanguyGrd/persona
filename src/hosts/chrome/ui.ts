import { STAGE_CSS } from '../../stage/styles';
import { createAvatarView, type AvatarView } from '../../stage/avatarView';
import type { AvatarAsset } from '../../core/avatar/types';

/** Small helpers shared by the popup, options and welcome pages. */

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

let stageCssInjected = false;
function injectStageCss() {
  if (stageCssInjected) return;
  stageCssInjected = true;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(STAGE_CSS.replace(/:host\s*\{[^}]*\}/, ''));
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

/** An animated, non-interactive preview of an avatar (idle breathing, blinking, waving on hover). */
export function avatarPreview(asset: AvatarAsset, height = 96): { el: HTMLElement; view: AvatarView } {
  injectStageCss();
  const view = createAvatarView(asset);
  const motion = h('div', { class: 'pc-motion' });
  motion.appendChild(view.el);
  const actor = h('div', { class: 'pc-actor pc-preview' }, motion);
  actor.dataset.activity = 'idle';
  actor.style.position = 'relative';
  actor.style.height = `${height}px`;
  actor.style.width = `${Math.round(height * view.aspect)}px`;
  actor.addEventListener('mouseenter', () => { actor.dataset.activity = 'wave'; view.setClip('wave'); view.setMood('happy'); });
  actor.addEventListener('mouseleave', () => { actor.dataset.activity = 'idle'; view.setClip('idle'); view.setMood('neutral'); });
  return { el: actor, view };
}

export const TONE_LABEL: Record<string, string> = {
  cheerful: 'Enjoué', calm: 'Calme', playful: 'Espiègle', shy: 'Timide', grumpy: 'Ronchon',
};
export const LANG_LABEL: Record<string, string> = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch' };
export const SOURCE_LABEL: Record<string, string> = { builtin: 'Intégré', manual: 'Manuel', imported: 'Importé', generated: 'Généré' };
