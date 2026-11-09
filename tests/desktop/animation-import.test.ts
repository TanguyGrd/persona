// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { importAnimatedCompanion, validateAnimatedAsset } from '../../src/hosts/windows/animationImport';
import { exportPack, type ImportFile } from '../../src/core/avatar/importer';
import { MemoryStore, Repository } from '../../src/core/settings/store';
import { BUILTIN_AVATARS, BUILTIN_PROFILES } from '../../characters';
import type { SpriteAvatar } from '../../src/core/avatar/types';

const deps = { imageSize: async () => ({ w: 128, h: 64 }) };
const image: ImportFile = { name: 'walk.png', mime: 'image/png', size: 40, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' };
const descriptor = (extra = {}) => ({ name: 'walk.json', mime: 'application/json', size: 40, text: JSON.stringify({ format: 'persona-spritesheet', frameWidth: 32, frameHeight: 64, animations: { idle: [0], walk: { frames: [1, 2, 3], fps: 12 } }, ...extra }) });

describe('Windows animated imports', () => {
  it('preserves distinct walk clips and persists a playable character without replacing existing profiles', async () => {
    const repo = new Repository(new MemoryStore());
    await repo.ensureDefaults();
    const settings = await repo.getSettings();
    const first = await importAnimatedCompanion(repo, [image, descriptor()], deps);
    const second = await importAnimatedCompanion(repo, [image, descriptor()], deps);
    expect(first.profile.id).not.toBe(second.profile.id);
    expect((await repo.getAvatar(first.profile.avatarId)) as SpriteAvatar).toMatchObject({ kind: 'spritesheet', clips: { idle: { frames: [0] }, walk: { frames: [1, 2, 3], fps: 12 } } });
    expect(await repo.getProfile(first.profile.id)).toBeDefined();
    expect(await repo.getSettings()).toEqual(settings);
  });
  it('round-trips a Persona pack through Windows and refuses extra files instead of silently discarding them', async () => {
    const repo = new Repository(new MemoryStore());
    const pack = exportPack(BUILTIN_PROFILES[0]!, BUILTIN_AVATARS[0]!);
    const file = { name: 'pip.persona.json', mime: 'application/json', size: 100, text: JSON.stringify(pack) };
    const result = await importAnimatedCompanion(repo, [file], deps);
    expect(result.profile.name).toBe('Pip');
    expect(result.profile.avatarId).not.toBe(pack.avatar.id);
    await expect(importAnimatedCompanion(repo, [file, image], deps)).rejects.toThrow('pack Persona seul');
  });
  it('rejects huge sheets, invalid frame indices and unbounded frame ranges before saving', async () => {
    const store = new MemoryStore();
    const repo = new Repository(store);
    await expect(importAnimatedCompanion(repo, [image, descriptor({ frameWidth: 1, frameHeight: 1 })], deps)).rejects.toThrow('512');
    expect(store.data.size).toBe(0);
    const good = await importAnimatedCompanion(repo, [image, descriptor()], deps);
    const bad = structuredClone(good.avatar) as SpriteAvatar;
    bad.clips.walk!.frames = [999];
    await expect(validateAnimatedAsset(bad, deps)).rejects.toThrow('Clips');
    await expect(validateAnimatedAsset(good.avatar, { imageSize: async () => ({ w: 100_000, h: 100_000 }) })).rejects.toThrow('Dimensions');
    // A huge requested end is bounded to the actual sheet before Array.from.
    const bounded = await importAnimatedCompanion(repo, [image, descriptor({ animations: { walk: { from: 0, to: 1e12 } } })], deps);
    expect((bounded.avatar as SpriteAvatar).clips.walk!.frames).toEqual([0, 1, 2, 3]);
  });
});
