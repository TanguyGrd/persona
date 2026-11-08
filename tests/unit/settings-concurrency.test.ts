// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { KEYS, MemoryStore, Repository } from '../../src/core/settings/store';
import { replacePrimaryAvatar } from '../../src/core/profile/avatar';
import { createCompanion, exportCompanionPack, prepareReferences } from '../../src/core/creation/character';
import { importAvatarFiles } from '../../src/core/avatar/importer';

describe('concurrent settings updates', () => {
  it('keeps both activation and autonomous position updates instead of losing a patch', async () => {
    const repo = new Repository(new MemoryStore());
    await repo.ensureDefaults();
    await Promise.all([
      repo.saveSettings({ activeProfileId: 'new-companion' }),
      repo.saveSettings({ position: { xRatio: 0.4, yPx: 14 } }),
      repo.saveSettings({ userName: 'Tanguy' }),
    ]);
    expect(await repo.getSettings()).toMatchObject({ activeProfileId: 'new-companion', position: { xRatio: 0.4, yPx: 14 }, userName: 'Tanguy' });
  });

  it('rejects a failed write but drains later queued and subsequent requests', async () => {
    class FailingStore extends MemoryStore {
      failNext = false;
      override async set(key: string, value: unknown) {
        if (key === KEYS.settings && this.failNext) { this.failNext = false; throw new Error('disk full'); }
        await super.set(key, value);
      }
    }
    const store = new FailingStore();
    const repo = new Repository(store);
    await repo.ensureDefaults();
    store.failNext = true;
    const results = await Promise.allSettled([
      repo.saveSettings({ userName: 'Failed update' }),
      repo.saveSettings({ activeProfileId: 'valid-companion' }),
    ]);
    expect(results[0]!.status).toBe('rejected');
    expect(results[1]!.status).toBe('fulfilled');
    await repo.saveSettings({ position: { xRatio: 0.6, yPx: 0 } });
    expect(await repo.getSettings()).toMatchObject({ userName: '', activeProfileId: 'valid-companion', position: { xRatio: 0.6, yPx: 0 } });
  });
});

describe('replacement of a workshop primary view', () => {
  it('keeps a ten-view profile exportable when Chrome replaces the visible avatar', async () => {
    const repo = new Repository(new MemoryStore());
    const files = Array.from({ length: 10 }, (_, index) => ({ name: `view${index}.png`, mime: 'image/png', size: 100, dataUrl: 'data:image/png;base64,aGVsbG8=' }));
    const decoder = { imageSize: async () => ({ w: 128, h: 128 }) };
    const profile = await createCompanion(repo, { references: await prepareReferences(files, decoder), primaryIndex: 4, name: 'Mousse', universe: 'Jardin' });
    const originalIds = [...profile.meta.creation!.referenceAvatarIds];
    const replacement = (await importAvatarFiles([{ ...files[0]!, name: 'new-main.png' }], decoder)).avatar;
    await repo.saveAvatar(replacement);
    const next = replacePrimaryAvatar(profile, replacement.id);
    await repo.saveProfile(next);
    const pack = await exportCompanionPack(repo, profile.id);
    expect(pack.avatar.id).toBe(replacement.id);
    expect(pack.references).toHaveLength(9);
    expect(pack.references!.some((reference) => reference.id === profile.avatarId)).toBe(false);
    expect(next.universe).toBe('Jardin');
    expect(next.meta.creation!.referenceAvatarIds).toHaveLength(10);
    expect(profile.meta.creation!.referenceAvatarIds).toEqual(originalIds);
    expect(profile.avatarId).toBe(originalIds[4]);
  });
});
