import { describe, expect, it } from 'vitest';
import { MAX_REFERENCE_PIXELS, MAX_REFERENCE_SIDE, prepareReferences } from '../../src/core/creation/character';
import type { ImportFile } from '../../src/core/avatar/importer';

const image = (name = 'face.png'): ImportFile => ({ name, mime: 'image/png', size: 100, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });

describe('workshop raster dimension bounds', () => {
  it.each([
    { w: MAX_REFERENCE_SIDE + 1, h: 1 },
    { w: 1, h: MAX_REFERENCE_SIDE + 1 },
    { w: 4096, h: 4097 },
    { w: 0, h: 100 },
    { w: 100, h: -1 },
    { w: Number.NaN, h: 100 },
    { w: 100, h: Number.POSITIVE_INFINITY },
  ])('rejects compressed images with unsafe dimensions $w × $h before accepting more views', async (size) => {
    let calls = 0;
    await expect(prepareReferences([image(), image('profil.png')], {
      imageSize: async () => { calls++; return size; },
    })).rejects.toThrow(/Dimensions d’image/);
    expect(calls).toBe(1);
  });

  it.each([
    { w: 128, h: 256 },
    { w: 4096, h: 4096 },
    { w: MAX_REFERENCE_SIDE, h: MAX_REFERENCE_PIXELS / MAX_REFERENCE_SIDE },
  ])('accepts supported dimensions $w × $h and preserves the decoded aspect', async (size) => {
    const [reference] = await prepareReferences([image()], { imageSize: async () => size });
    expect(reference?.avatar).toMatchObject({ kind: 'image', naturalWidth: size.w, naturalHeight: size.h });
  });
});
