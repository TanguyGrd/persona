import { Repository, type KeyValueStore } from '../../core/settings/store';

/** chrome.storage.local as the Persona key-value store. Everything stays on this device. */
export const chromeStore: KeyValueStore = {
  async get<T>(key: string) {
    const r = await chrome.storage.local.get(key);
    return r[key] as T | undefined;
  },
  async getMany(keys: string[]) {
    return chrome.storage.local.get(keys);
  },
  async set(key: string, value: unknown) {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key: string) {
    await chrome.storage.local.remove(key);
  },
};

export const repo = new Repository(chromeStore);

/** Global "hidden" flag: hiding the companion applies to every tab until it is brought back. */
export const HIDDEN_KEY = 'hidden';

export type PersonaMessage =
  | { type: 'persona:toggle-hidden' }
  | { type: 'persona:talk' }
  | { type: 'persona:status' }
  | { type: 'persona:open-options' };

export interface PersonaStatus {
  present: boolean;
  hidden: boolean;
  activity: string;
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
