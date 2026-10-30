// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { exportPack, fileKind, importAvatarFiles, normalizeAvatar, MAX_FILE_BYTES, type ImportFile } from '../../src/core/avatar/importer';
import { BUILTIN_AVATARS, BUILTIN_PROFILES } from '../../characters';

const deps = { imageSize: async () => ({ w: 128, h: 64 }) };
const png = (name = 'cat.png'): ImportFile => ({ name, mime: 'image/png', size: 100, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });

describe('avatar import', () => {
  it('recognises file kinds', () => {
    expect(fileKind('a.PNG', '')).toBe('raster');
    expect(fileKind('a.gif', 'image/gif')).toBe('raster');
    expect(fileKind('a.svg', '')).toBe('svg');
    expect(fileKind('a.json', '')).toBe('json');
    expect(fileKind('a.exe', '')).toBe('unknown');
  });

  it('imports a single image', async () => {
    const r = await importAvatarFiles([png()], deps);
    expect(r.avatar).toMatchObject({ kind: 'image', name: 'cat', naturalWidth: 128, naturalHeight: 64, mime: 'image/png' });
  });

  it('imports an SVG and sanitises it', async () => {
    const r = await importAvatarFiles([{ name: 'ghost.svg', mime: 'image/svg+xml', size: 10, text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>x</script><circle r="4"/></svg>' }], deps);
    expect(r.avatar.kind).toBe('svg');
    if (r.avatar.kind === 'svg') {
      expect(r.avatar.svg).not.toContain('script');
      expect(r.avatar.rigged).toBe(false);
    }
    expect(r.warnings.join()).toMatch(/retirés/);
  });

  it('imports a sprite sheet from an image + descriptor', async () => {
    const desc: ImportFile = { name: 'sheet.json', mime: 'application/json', size: 10, text: JSON.stringify({ format: 'persona-spritesheet', frameWidth: 32, frameHeight: 32, animations: { idle: [0, 1], walk: [2, 3] } }) };
    const r = await importAvatarFiles([desc, png('sheet.png')], deps);
    expect(r.avatar.kind).toBe('spritesheet');
    if (r.avatar.kind === 'spritesheet') {
      expect(r.avatar.frames).toHaveLength(8);
      expect(Object.keys(r.avatar.clips)).toEqual(['idle', 'walk']);
    }
  });

  it('asks for the image when only the descriptor is given', async () => {
    const desc: ImportFile = { name: 'sheet.json', mime: 'application/json', size: 10, text: JSON.stringify({ format: 'persona-spritesheet', frameWidth: 32, frameHeight: 32 }) };
    await expect(importAvatarFiles([desc], deps)).rejects.toThrow(/image de la sprite sheet/);
  });

  it('round-trips a Persona pack with fresh ids', async () => {
    const pack = exportPack(BUILTIN_PROFILES[0]!, BUILTIN_AVATARS[0]!);
    expect(pack.avatar.builtin).toBeUndefined();
    const r = await importAvatarFiles([{ name: 'pip.persona.json', mime: 'application/json', size: 10, text: JSON.stringify(pack) }], deps);
    expect(r.profile?.name).toBe('Pip');
    expect(r.profile?.id).not.toBe('builtin:pip');
    expect(r.profile?.meta.source).toBe('imported');
    expect(r.profile?.avatarId).toBe(r.avatar.id);
    expect(r.avatar.kind).toBe('svg');
  });

  it('rejects oversized, unknown and malformed files', async () => {
    await expect(importAvatarFiles([{ ...png(), size: MAX_FILE_BYTES + 1 }], deps)).rejects.toThrow(/dépasse/);
    await expect(importAvatarFiles([{ name: 'x.bmp', mime: 'image/bmp', size: 1 }], deps)).rejects.toThrow(/Format non reconnu/);
    await expect(importAvatarFiles([{ name: 'x.json', mime: 'application/json', size: 1, text: '{oops' }], deps)).rejects.toThrow(/JSON valide/);
    await expect(importAvatarFiles([{ name: 'x.json', mime: 'application/json', size: 1, text: '{"a":1}' }], deps)).rejects.toThrow(/ni un pack/);
    await expect(importAvatarFiles([], deps)).rejects.toThrow(/Aucun fichier/);
  });

  it('refuses avatars pointing at non-image data', () => {
    expect(() => normalizeAvatar({ kind: 'image', dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' })).toThrow(/non pris en charge/);
    expect(() => normalizeAvatar({ kind: 'video' })).toThrow();
  });
});
