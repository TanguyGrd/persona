import { describe, expect, it } from 'vitest';
import { clipFromName, isSpriteDescriptor, parseSpriteDescriptor } from '../../src/core/avatar/sprites';
import { resolveClip, clipFor } from '../../src/core/avatar/types';

describe('sprite descriptors', () => {
  it('maps common animation names (fr/en) to clips', () => {
    expect(clipFromName('Idle')).toBe('idle');
    expect(clipFromName('run')).toBe('walk');
    expect(clipFromName('walk_03.png')).toBe('walk');
    expect(clipFromName('coucou')).toBe('wave');
    expect(clipFromName('dodo')).toBe('sleep');
    expect(clipFromName('attack')).toBeNull();
  });

  it('reads the Persona grid format', () => {
    const json = { format: 'persona-spritesheet', version: 1, frameWidth: 32, frameHeight: 48, animations: {
      idle: { frames: [0, 1], fps: 4 }, marche: { from: 2, to: 5, fps: 10 }, jump: [6, 7], dance: { frames: [0] },
    } };
    expect(isSpriteDescriptor(json)).toBe(true);
    const r = parseSpriteDescriptor(json, { w: 128, h: 96 });
    expect(r.frames).toHaveLength(8);
    expect(r.frames[5]).toEqual({ x: 32, y: 48, w: 32, h: 48 });
    expect(r.clips.idle).toEqual({ frames: [0, 1], fps: 4, loop: true });
    expect(r.clips.walk!.frames).toEqual([2, 3, 4, 5]);
    expect(r.clips.jump!.frames).toEqual([6, 7]);
    expect(r.warnings.join()).toMatch(/dance/);
  });

  it('reads an Aseprite export (array + frame tags)', () => {
    const frame = (x: number) => ({ frame: { x, y: 0, w: 16, h: 16 }, duration: 125 });
    const json = { frames: [frame(0), frame(16), frame(32), frame(48)], meta: { image: 'pip.png', size: { w: 64, h: 16 }, frameTags: [
      { name: 'Idle', from: 0, to: 1, direction: 'forward' }, { name: 'Walk', from: 2, to: 3, direction: 'pingpong' },
    ] } };
    const r = parseSpriteDescriptor(json, { w: 64, h: 16 });
    expect(r.image).toBe('pip.png');
    expect(r.clips.idle).toEqual({ frames: [0, 1], fps: 8, loop: true });
    expect(r.clips.walk!.frames).toEqual([2, 3]);
  });

  it('reads a TexturePacker hash export grouped by frame names', () => {
    const json = { frames: {
      'idle_0.png': { frame: { x: 0, y: 0, w: 20, h: 30 } },
      'idle_1.png': { frame: { x: 20, y: 0, w: 20, h: 30 } },
      'jump_0.png': { frame: { x: 40, y: 0, w: 20, h: 30 } },
    }, meta: { image: 'sheet.png' } };
    const r = parseSpriteDescriptor(json, { w: 60, h: 30 });
    expect(r.clips.idle!.frames).toEqual([0, 1]);
    expect(r.clips.jump!.frames).toEqual([2]);
  });

  it('falls back to an idle clip and warns about frames outside the image', () => {
    const json = { frames: [{ frame: { x: 0, y: 0, w: 50, h: 50 } }], meta: {} };
    const r = parseSpriteDescriptor(json, { w: 40, h: 40 });
    expect(r.clips.idle!.frames).toEqual([0]);
    expect(r.warnings.join()).toMatch(/dépassent/);
  });

  it('rejects unusable descriptors', () => {
    expect(() => parseSpriteDescriptor({ format: 'persona-spritesheet' }, { w: 10, h: 10 })).toThrow(/frameWidth/);
    expect(() => parseSpriteDescriptor({ frames: [], meta: {} }, { w: 10, h: 10 })).toThrow(/Aucune frame/);
  });
});

describe('clip resolution', () => {
  it('maps activities to clips', () => {
    expect(clipFor('dragging')).toBe('dangle');
    expect(clipFor('react', 'hop')).toBe('jump');
    expect(clipFor('entering')).toBe('enter');
  });
  it('falls back gracefully when a sprite sheet lacks a clip', () => {
    expect(resolveClip({ idle: 1, jump: 1 }, 'wave')).toBe('idle');
    expect(resolveClip({ idle: 1, react: 1 }, 'wave')).toBe('react');
    expect(resolveClip({ walk: 1 }, 'sleep')).toBe('walk');
    expect(resolveClip({}, 'idle')).toBeNull();
  });
});
