import type { KeyValueStore } from '../../core/settings/store';

/** Reuses Repository's schema in the persistent Tauri WebView profile, separate from Chrome. */
export class DesktopStore implements KeyValueStore {
  constructor(private storage: Storage, private prefix = 'persona:desktop:') {}
  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.storage.getItem(this.prefix + key);
    return raw === null ? undefined : JSON.parse(raw) as T;
  }
  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const entries = await Promise.all(keys.map(async (key) => [key, await this.get(key)] as const));
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
  }
  async set(key: string, value: unknown): Promise<void> {
    this.storage.setItem(this.prefix + key, JSON.stringify(value));
  }
  async remove(key: string): Promise<void> { this.storage.removeItem(this.prefix + key); }
}
