/**
 * Imported SVGs are rendered inline inside web pages, so they are reduced to a strict
 * allow-list: no scripts, no event handlers, no external references, no foreignObject.
 */

const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'symbol', 'use',
  'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'title', 'desc', 'text', 'tspan',
  'image', 'filter', 'fegaussianblur', 'feoffset', 'femerge', 'femergenode', 'fecolormatrix', 'feflood',
  'fecomposite', 'feblend', 'fedropshadow', 'femorphology',
]);

const ALLOWED_ATTRS = new Set([
  'id', 'class', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy',
  'd', 'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity',
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'clip-path',
  'clip-rule', 'mask', 'maskunits', 'patternunits', 'patterntransform', 'preserveaspectratio', 'href', 'xlink:href',
  'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'visibility',
  'display', 'filter', 'stddeviation', 'dx', 'dy', 'in', 'in2', 'result', 'mode', 'operator', 'values', 'type',
  'flood-color', 'flood-opacity', 'k1', 'k2', 'k3', 'k4', 'radius', 'filterunits', 'primitiveunits', 'style',
  'xmlns', 'xmlns:xlink', 'version', 'paint-order', 'vector-effect', 'mix-blend-mode',
]);

const SAFE_IMAGE_HREF = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

function safeUrlRefs(value: string): boolean {
  // Only same-document references such as url(#gradient) are allowed.
  const refs = value.match(/url\s*\(([^)]*)\)/gi) ?? [];
  return refs.every((r) => /^url\s*\(\s*['"]?#[\w.-]+['"]?\s*\)$/i.test(r));
}

function cleanStyle(style: string): string | null {
  if (/expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding/i.test(style)) return null;
  if (!safeUrlRefs(style)) return null;
  return style;
}

export interface SanitizeResult {
  svg: string;
  /** True when the SVG follows the Persona rig convention (data-part attributes). */
  rigged: boolean;
  removed: string[];
  viewBox: { w: number; h: number } | null;
}

export function sanitizeSvg(markup: string): SanitizeResult {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) {
    throw new Error('Fichier SVG invalide.');
  }
  const removed: string[] = [];

  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const name = child.nodeName.toLowerCase();
      if (!ALLOWED_ELEMENTS.has(name)) {
        removed.push(`<${name}>`);
        child.remove();
        continue;
      }
      walk(child);
    }
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      const v = attr.value;
      let keep = ALLOWED_ATTRS.has(n) || n.startsWith('data-') || n.startsWith('aria-');
      if (n.startsWith('on')) keep = false;
      if (/javascript:|vbscript:|data:text/i.test(v)) keep = false;
      if (keep && (n === 'href' || n === 'xlink:href')) {
        const isImage = el.nodeName.toLowerCase() === 'image';
        keep = v.startsWith('#') ? !isImage : isImage && SAFE_IMAGE_HREF.test(v);
      }
      if (keep && n === 'style') {
        const s = cleanStyle(v);
        keep = s !== null;
      } else if (keep && /url\s*\(/i.test(v)) {
        keep = safeUrlRefs(v);
      }
      if (!keep) {
        removed.push(`@${n}`);
        el.removeAttribute(attr.name);
      }
    }
  };
  walk(root);

  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  let viewBox: SanitizeResult['viewBox'] = null;
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0) viewBox = { w: vb[2]!, h: vb[3]! };
  else {
    const w = parseFloat(root.getAttribute('width') ?? '');
    const h = parseFloat(root.getAttribute('height') ?? '');
    if (w > 0 && h > 0) {
      viewBox = { w, h };
      root.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }
  }
  root.removeAttribute('width');
  root.removeAttribute('height');

  const rigged = !!root.querySelector('[data-part="body"]') && !!root.querySelector('[data-part^="eye"], [data-part="mouth"], [data-part^="arm"]');
  return { svg: new XMLSerializer().serializeToString(root), rigged, removed, viewBox };
}
