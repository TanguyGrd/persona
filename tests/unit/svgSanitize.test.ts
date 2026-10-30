// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../../src/core/avatar/svgSanitize';
import { BUILTIN_AVATARS } from '../../characters';

describe('sanitizeSvg', () => {
  it('removes scripts, event handlers, foreignObject and javascript: links', () => {
    const r = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">
      <script>alert(1)</script>
      <foreignObject><div>x</div></foreignObject>
      <a href="javascript:alert(1)"><rect width="5" height="5"/></a>
      <circle cx="5" cy="5" r="4" onclick="steal()" fill="red"/>
    </svg>`);
    expect(r.svg).not.toMatch(/script|onload|onclick|foreignObject|javascript|<a/i);
    expect(r.svg).toContain('<circle');
    expect(r.removed).toEqual(expect.arrayContaining(['<script>', '<foreignobject>', '<a>', '@onload', '@onclick']));
  });

  it('blocks external references but keeps local ones', () => {
    const r = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>
      <rect width="10" height="10" fill="url(#g)"/>
      <rect width="10" height="10" fill="url(https://evil.example/track)"/>
      <rect width="10" height="10" style="fill: url(https://evil.example/x)"/>
      <use href="#g"/><use href="https://evil.example/sprite.svg#x"/>
      <image href="https://evil.example/pixel.png"/>
      <image href="data:image/png;base64,iVBORw0KGgo="/>
    </svg>`);
    expect(r.svg).toContain('url(#g)');
    expect(r.svg).not.toContain('evil.example');
    expect(r.svg).toContain('data:image/png;base64');
  });

  it('removes <style> elements and dangerous inline styles', () => {
    const r = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><style>@import url(x)</style><rect style="width: expression(alert(1))"/><rect style="fill: red"/></svg>');
    expect(r.svg).not.toContain('<style');
    expect(r.svg).not.toContain('expression');
    expect(r.svg).toContain('fill: red');
  });

  it('detects the Persona rig and keeps data-part attributes', () => {
    const pip = BUILTIN_AVATARS[0]!;
    if (pip.kind !== 'svg') throw new Error('expected svg');
    const r = sanitizeSvg(pip.svg);
    expect(r.rigged).toBe(true);
    expect(r.removed).toEqual([]);
    expect(r.svg).toContain('data-part="arm-right"');
    expect(r.viewBox).toEqual({ w: 120, h: 140 });
  });

  it('derives a viewBox from width/height and reports non-rigged SVGs', () => {
    const r = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32"/></svg>');
    expect(r.viewBox).toEqual({ w: 64, h: 32 });
    expect(r.svg).toContain('viewBox="0 0 64 32"');
    expect(r.rigged).toBe(false);
  });

  it('rejects non-SVG input', () => {
    expect(() => sanitizeSvg('<html><body>nope</body></html>')).toThrow(/SVG invalide/);
  });
});
