import { describe, expect, it } from 'vitest';
import { MemoryStore, Repository, KEYS } from '../../src/core/settings/store';
import { normalizeProfile } from '../../src/core/profile/validate';
import type { AvatarAsset } from '../../src/core/avatar/types';

const avatar: AvatarAsset = { id: 'avatar-1', kind: 'image', name: 'Chat', dataUrl: 'data:image/png;base64,AAAA', mime: 'image/png', naturalWidth: 10, naturalHeight: 10, height: 100, facing: 'front' };

describe('Repository', () => {
  it('works on an empty store with the built-in character', async () => {
    const repo = new Repository(new MemoryStore());
    const { profile, avatar } = await repo.getActiveCharacter();
    expect(profile.id).toBe('builtin:pip');
    expect(avatar.kind).toBe('svg');
    expect((await repo.listProfiles()).map((p) => p.id)).toEqual(['builtin:pip']);
  });

  it('stores profiles and avatars separately', async () => {
    const store = new MemoryStore();
    const repo = new Repository(store);
    const p = normalizeProfile({ id: 'p1', name: 'Chat', avatarId: 'avatar-1' }).value;
    await repo.saveAvatar(avatar);
    await repo.saveProfile(p);
    await repo.saveSettings({ activeProfileId: 'p1' });
    expect(store.data.has(KEYS.avatar('avatar-1'))).toBe(true);
    expect(JSON.stringify(store.data.get(KEYS.profiles))).not.toContain('base64');
    const active = await repo.getActiveCharacter();
    expect(active.profile.name).toBe('Chat');
    expect(active.avatar.id).toBe('avatar-1');
  });

  it('refuses to overwrite built-in characters', async () => {
    const repo = new Repository(new MemoryStore());
    const pip = (await repo.getProfile('builtin:pip'))!;
    await expect(repo.saveProfile(pip)).rejects.toThrow(/dupliquez/);
  });

  it('falls back to the built-in character when the active one is missing', async () => {
    const repo = new Repository(new MemoryStore());
    await repo.saveSettings({ activeProfileId: 'ghost' });
    expect((await repo.getActiveCharacter()).profile.id).toBe('builtin:pip');
  });

  it('deleting a profile removes its unused avatar and resets the active character', async () => {
    const store = new MemoryStore();
    const repo = new Repository(store);
    await repo.saveAvatar(avatar);
    await repo.saveProfile(normalizeProfile({ id: 'p1', name: 'Chat', avatarId: 'avatar-1' }).value);
    await repo.saveSettings({ activeProfileId: 'p1' });
    await repo.deleteProfile('p1');
    expect(store.data.has(KEYS.avatar('avatar-1'))).toBe(false);
    expect((await repo.getSettings()).activeProfileId).toBe('builtin:pip');
  });

  it('keeps speech memory per character', async () => {
    const repo = new Repository(new MemoryStore());
    await repo.saveMemory('a', { lastGreetingAt: 5, recent: ['k'] });
    expect(await repo.getMemory('a')).toEqual({ lastGreetingAt: 5, recent: ['k'] });
    expect(await repo.getMemory('b')).toEqual({ lastGreetingAt: 0, recent: [] });
  });

  it('writes defaults only once', async () => {
    const store = new MemoryStore();
    const repo = new Repository(store);
    await repo.ensureDefaults();
    await repo.saveSettings({ userName: 'Tanguy' });
    await repo.ensureDefaults();
    expect((await repo.getSettings()).userName).toBe('Tanguy');
  });
});
