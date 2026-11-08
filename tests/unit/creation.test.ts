// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createCompanion, exportCompanionPack, MAX_REFERENCE_BYTES, prepareReferences } from '../../src/core/creation/character';
import { exportPack, importAvatarFiles, MAX_PACK_BYTES, type ImportFile } from '../../src/core/avatar/importer';
import { KEYS, MemoryStore, Repository } from '../../src/core/settings/store';
import { normalizeProfile } from '../../src/core/profile/validate';
import { BUILTIN_AVATARS, BUILTIN_PROFILES } from '../../characters';

const deps = { imageSize: async () => ({ w: 128, h: 256 }) };
const png = (name = 'face.png'): ImportFile => ({ name, mime: 'image/png', size: 100, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });

async function draft() { return prepareReferences([png(), png('profil.png')], deps); }

describe('instant character workshop', () => {
  it('keeps every reference, selects the principal view and preserves optional identity through normalization', async () => {
    const store = new MemoryStore();
    const repo = new Repository(store);
    await repo.ensureDefaults();
    const previousSettings = await repo.getSettings();
    const prepared = await draft();
    const profile = await createCompanion(repo, { references: prepared, primaryIndex: 1, name: 'Mousse', universe: 'Mon jardin', description: 'Calme et curieux' });
    expect(profile.name).toBe('Mousse');
    expect(profile.universe).toBe('Mon jardin');
    expect(profile.meta.generator).toBe('local-heuristic@1');
    expect(profile.meta.creation).toMatchObject({ mode: 'instant', source: 'user' });
    const ids = profile.meta.creation!.referenceAvatarIds;
    expect(ids).toHaveLength(2);
    expect(profile.avatarId).toBe(ids[1]);
    expect((await repo.getAvatar(profile.avatarId))!.name).toBe('profil');
    expect(ids).not.toContain(prepared[0]!.avatar.id);
    expect(await repo.getSettings()).toEqual(previousSettings);
    const reopened = new Repository(store);
    expect(await reopened.getProfile(profile.id)).toMatchObject({ universe: 'Mon jardin', meta: { creation: { referenceAvatarIds: ids } } });
    expect((await reopened.getProfile(profile.id))!.meta.uncertainties!.join(' ')).toContain('aucune analyse visuelle');
  });

  it('uses a neutral optional name, validates primary selection and avoids overwriting reusable draft assets', async () => {
    const repo = new Repository(new MemoryStore());
    const references = await draft();
    const first = await createCompanion(repo, { references, primaryIndex: 0 });
    const second = await createCompanion(repo, { references, primaryIndex: 0 });
    expect(first.name).toBe('Compagnon');
    expect(first.universe).toBeUndefined();
    expect(second.avatarId).not.toBe(first.avatarId);
    for (const primaryIndex of [-1, 2, NaN, 0.5]) await expect(createCompanion(repo, { references, primaryIndex })).rejects.toThrow('vue principale');
    await expect(createCompanion(repo, { references: [], primaryIndex: 0 })).rejects.toThrow('1 et 10');
  });

  it('validates count, types and aggregate size before decoding and accepts ten images', async () => {
    let decodes = 0;
    const decoder = { imageSize: async () => { decodes++; return { w: 50, h: 50 }; } };
    await expect(prepareReferences([], decoder)).rejects.toThrow('1 et 10');
    await expect(prepareReferences(Array.from({ length: 11 }, () => png()), decoder)).rejects.toThrow('1 et 10');
    await expect(prepareReferences([{ ...png(), size: 8 * 1024 * 1024 + 1 }], decoder)).rejects.toThrow('8 Mo');
    await expect(prepareReferences(Array.from({ length: 5 }, () => ({ ...png(), size: MAX_REFERENCE_BYTES / 4 })), decoder)).rejects.toThrow('32 Mo');
    await expect(prepareReferences([{ name: 'pack.json', mime: 'application/json', size: 1, text: '{}' }], decoder)).rejects.toThrow('image');
    expect(decodes).toBe(0);
    expect(await prepareReferences(Array.from({ length: 10 }, () => png()), decoder)).toHaveLength(10);
    expect(decodes).toBe(10);
  });

  it('sanitises each SVG independently and keeps its warnings visible', async () => {
    const files: ImportFile[] = [png(), { name: 'dos.svg', mime: 'image/svg+xml', size: 80, text: '<svg viewBox="0 0 10 10"><script>alert(1)</script><circle r="2"/></svg>' }];
    const refs = await prepareReferences(files, deps);
    expect(refs[1]!.name).toBe('dos.svg');
    expect(refs[1]!.warnings.join(' ')).toContain('retirés');
    expect(JSON.stringify(refs[1]!.avatar)).not.toContain('alert');
  });

  it('rolls back partial avatar saves and leaves previous profiles/settings untouched on quota failure', async () => {
    class FailingStore extends MemoryStore {
      failProfile = false;
      override async set(key: string, value: unknown) {
        if (this.failProfile && key === KEYS.profiles) throw new Error('QuotaExceededError');
        await super.set(key, value);
      }
    }
    const store = new FailingStore();
    const repo = new Repository(store);
    await repo.ensureDefaults();
    const old = await createCompanion(repo, { references: await draft(), primaryIndex: 0, name: 'Existant' });
    await repo.saveSettings({ activeProfileId: old.id });
    const before = structuredClone(store.data);
    store.failProfile = true;
    await expect(createCompanion(repo, { references: await draft(), primaryIndex: 1 })).rejects.toThrow('QuotaExceededError');
    expect(store.data).toEqual(before);
  });

  it('deletes orphan reference views but retains assets still used by another character', async () => {
    const store = new MemoryStore();
    const repo = new Repository(store);
    const profile = await createCompanion(repo, { references: await draft(), primaryIndex: 0 });
    const [primary, reference] = profile.meta.creation!.referenceAvatarIds;
    await repo.saveProfile({ ...profile, id: 'another-profile', avatarId: reference!, meta: { source: 'manual', createdAt: 1, updatedAt: 1 } });
    await repo.saveSettings({ activeProfileId: profile.id });
    await repo.deleteProfile(profile.id);
    expect(await repo.getAvatar(primary!)).toBeUndefined();
    expect(await repo.getAvatar(reference!)).toBeDefined();
    expect((await repo.getSettings()).activeProfileId).toBe('builtin:pip');
    await repo.deleteProfile('another-profile');
    expect(await repo.getAvatar(reference!)).toBeUndefined();
  });

  it('exports a multi-reference pack and imports it with fresh mapped ids, preserving the selected view and universe', async () => {
    const repo = new Repository(new MemoryStore());
    const profile = await createCompanion(repo, { references: await draft(), primaryIndex: 1, name: 'Mousse', universe: 'Jardin' });
    const pack = await exportCompanionPack(repo, profile.id);
    expect(pack.references).toHaveLength(1);
    const text = JSON.stringify(pack);
    const imported = await importAvatarFiles([{ name: 'mousse.persona.json', mime: 'application/json', size: text.length, text }], deps);
    expect(imported.profile).toMatchObject({ name: 'Mousse', universe: 'Jardin', avatarId: imported.avatar.id });
    expect(imported.avatar.name).toBe('profil');
    expect(imported.references![0]!.name).toBe('face');
    expect(imported.profile!.meta.creation!.referenceAvatarIds).toHaveLength(2);
    const importedIds = imported.profile!.meta.creation!.referenceAvatarIds;
    expect(importedIds).toContain(imported.avatar.id);
    expect(importedIds).toContain(imported.references![0]!.id);
    expect(importedIds.every((id) => !profile.meta.creation!.referenceAvatarIds.includes(id))).toBe(true);
  });

  it('keeps legacy packs working and bounds unsupported/duplicated/oversized references', async () => {
    const pack = exportPack(BUILTIN_PROFILES[0]!, BUILTIN_AVATARS[0]!);
    const parse = (data: unknown) => importAvatarFiles([{ name: 'pip.json', mime: 'application/json', size: 1, text: JSON.stringify(data) }], deps);
    const old = await parse(pack);
    expect(old.profile!.name).toBe('Pip');
    expect(old.references).toBeUndefined();
    await expect(parse({ ...pack, references: Array(10).fill(pack.avatar) })).rejects.toThrow('10 vues');
    await expect(parse({ ...pack, references: [pack.avatar] })).rejects.toThrow('dupliqués');
    await expect(parse({ ...pack, references: [{ kind: 'image', dataUrl: 'data:text/html;base64,eA==' }] })).rejects.toThrow('format');
    await expect(parse({ ...pack, version: 2 })).rejects.toThrow('Version');
    await expect(importAvatarFiles([{ name: 'huge.json', mime: 'application/json', size: MAX_PACK_BYTES + 1, text: '{}' }], deps)).rejects.toThrow('48 Mo');
  });

  it('normalizes only bounded user reference provenance and universe fields', () => {
    const normalized = normalizeProfile({ ...BUILTIN_PROFILES[0], universe: 'x'.repeat(200), meta: { source: 'manual', creation: { mode: 'instant', source: 'user', preparedAt: NaN, referenceAvatarIds: ['a', 'a', ...Array.from({ length: 20 }, (_, i) => 'b' + i)] } } }, 123).value;
    expect(normalized.universe).toHaveLength(120);
    expect(normalized.meta.creation!.referenceAvatarIds).toHaveLength(10);
    expect(normalized.meta.creation!.preparedAt).toBe(123);
  });
});
