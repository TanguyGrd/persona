import { normalizeProfile } from '../profile/validate';
import type { CharacterProfile } from '../profile/types';
import { EMPTY_MEMORY, type SpeechMemory } from '../profile/speech';
import type { AvatarAsset } from '../avatar/types';
import { BUILTIN_AVATARS, BUILTIN_PROFILES } from '../../../characters';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './settings';

/** Storage contract implemented by each host (chrome.storage, a JSON file on Windows, memory in tests). */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  getMany(keys: string[]): Promise<Record<string, unknown>>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.data.get(key)) as T | undefined; }
  async getMany(keys: string[]) {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (this.data.has(k)) out[k] = structuredClone(this.data.get(k));
    return out;
  }
  async set(key: string, value: unknown) { this.data.set(key, structuredClone(value)); }
  async remove(key: string) { this.data.delete(key); }
}

export const KEYS = {
  settings: 'settings',
  profiles: 'profiles',
  memory: 'speechMemory',
  avatar: (id: string) => `avatar:${id}`,
} as const;

export interface ActiveCharacter {
  profile: CharacterProfile;
  avatar: AvatarAsset;
}

/**
 * All persistence goes through here. Built-in characters are never written to storage:
 * they are merged in at read time and can be duplicated to be edited.
 * Avatars live under their own key so large images are not rewritten with every profile edit.
 */
export class Repository {
  private settingsQueue: Promise<void> = Promise.resolve();

  constructor(readonly store: KeyValueStore) {}

  async getSettings(): Promise<Settings> {
    return normalizeSettings(await this.store.get(KEYS.settings));
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const requested = structuredClone(patch);
    // Position updates and user actions can arrive together. Queue the complete
    // read/merge/write operation so one patch cannot restore an older profile.
    const operation = this.settingsQueue.then(async () => {
      const next = normalizeSettings({ ...(await this.getSettings()), ...requested });
      await this.store.set(KEYS.settings, next);
      return next;
    });
    // A failed write rejects its caller without blocking later valid updates.
    this.settingsQueue = operation.then(() => {}, () => {});
    return operation;
  }

  async ensureDefaults(): Promise<void> {
    const raw = await this.store.get(KEYS.settings);
    if (!raw) await this.store.set(KEYS.settings, DEFAULT_SETTINGS);
  }

  private async userProfiles(): Promise<Record<string, CharacterProfile>> {
    const raw = (await this.store.get<Record<string, unknown>>(KEYS.profiles)) ?? {};
    const out: Record<string, CharacterProfile> = {};
    for (const [id, p] of Object.entries(raw)) out[id] = normalizeProfile(p).value;
    return out;
  }

  async listProfiles(): Promise<CharacterProfile[]> {
    return [...BUILTIN_PROFILES, ...Object.values(await this.userProfiles()).sort((a, b) => a.meta.createdAt - b.meta.createdAt)];
  }

  async getProfile(id: string): Promise<CharacterProfile | undefined> {
    return BUILTIN_PROFILES.find((p) => p.id === id) ?? (await this.userProfiles())[id];
  }

  async saveProfile(profile: CharacterProfile): Promise<CharacterProfile> {
    if (profile.meta.source === 'builtin') throw new Error('Les personnages intégrés ne sont pas modifiables : dupliquez-les.');
    const { value } = normalizeProfile({ ...profile, meta: { ...profile.meta, updatedAt: Date.now() } });
    const all = await this.userProfiles();
    all[value.id] = value;
    await this.store.set(KEYS.profiles, all);
    return value;
  }

  async deleteProfile(id: string): Promise<void> {
    const all = await this.userProfiles();
    const p = all[id];
    if (!p) return;
    delete all[id];
    await this.store.set(KEYS.profiles, all);
    const removedAssets = new Set([p.avatarId, ...(p.meta.creation?.referenceAvatarIds ?? [])]);
    const retainedAssets = new Set(Object.values(all).flatMap((o) => [o.avatarId, ...(o.meta.creation?.referenceAvatarIds ?? [])]));
    for (const avatarId of removedAssets) {
      if (!retainedAssets.has(avatarId) && !avatarId.startsWith('builtin:')) await this.store.remove(KEYS.avatar(avatarId));
    }
    const s = await this.getSettings();
    if (s.activeProfileId === id) await this.saveSettings({ activeProfileId: DEFAULT_SETTINGS.activeProfileId });
  }

  async getAvatar(id: string): Promise<AvatarAsset | undefined> {
    return BUILTIN_AVATARS.find((a) => a.id === id) ?? (await this.store.get<AvatarAsset>(KEYS.avatar(id)));
  }

  async saveAvatar(avatar: AvatarAsset): Promise<void> {
    if (avatar.builtin) return;
    await this.store.set(KEYS.avatar(avatar.id), avatar);
  }

  /** The character to show. Falls back to the built-in demo if anything is missing. */
  async getActiveCharacter(settings?: Settings): Promise<ActiveCharacter> {
    const s = settings ?? (await this.getSettings());
    const fallback = BUILTIN_PROFILES[0]!;
    const profile = (await this.getProfile(s.activeProfileId)) ?? fallback;
    const avatar = (await this.getAvatar(profile.avatarId)) ?? (await this.getAvatar(fallback.avatarId))!;
    return { profile, avatar };
  }

  async getMemory(profileId: string): Promise<SpeechMemory> {
    const all = (await this.store.get<Record<string, SpeechMemory>>(KEYS.memory)) ?? {};
    return all[profileId] ?? { ...EMPTY_MEMORY };
  }

  async saveMemory(profileId: string, memory: SpeechMemory): Promise<void> {
    const all = (await this.store.get<Record<string, SpeechMemory>>(KEYS.memory)) ?? {};
    all[profileId] = memory;
    await this.store.set(KEYS.memory, all);
  }
}
