import { Companion } from '../../stage/companion';
import { Repository, type KeyValueStore } from '../../core/settings/store';
import type { Entrance } from '../../core/profile/types';

/** Browser-only host used for development, demos and as the seed of the Windows host. */
const localStore: KeyValueStore = {
  async get<T>(key: string) {
    try { const v = localStorage.getItem(`persona:${key}`); return v ? (JSON.parse(v) as T) : undefined; } catch { return undefined; }
  },
  async getMany(keys: string[]) {
    const out: Record<string, unknown> = {};
    for (const k of keys) { const v = await this.get(k); if (v !== undefined) out[k] = v; }
    return out;
  },
  async set(key: string, value: unknown) { try { localStorage.setItem(`persona:${key}`, JSON.stringify(value)); } catch { /* private mode */ } },
  async remove(key: string) { try { localStorage.removeItem(`persona:${key}`); } catch { /* private mode */ } },
};

const repo = new Repository(localStore);
let companion: Companion | null = null;

async function start(entrance?: Entrance) {
  companion?.destroy();
  const settings = await repo.getSettings();
  const { profile, avatar } = await repo.getActiveCharacter(settings);
  const memory = await repo.getMemory(profile.id);
  companion = new Companion({
    profile, avatar, settings, memory, entrance,
    callbacks: {
      saveMemory: (m) => void repo.saveMemory(profile.id, m),
      savePosition: (position) => void repo.saveSettings({ position }),
      openSettings: () => alert('Réglages : disponibles dans l’extension Chrome.'),
      placeName: () => location.hostname || 'local',
    },
  }).mount();
}

document.addEventListener('click', (e) => {
  const cmd = (e.target as HTMLElement).closest('button')?.dataset.cmd;
  if (!cmd) return;
  if (cmd === 'talk') companion?.talk();
  else if (cmd === 'hide') companion?.toggleHidden();
  else if (cmd === 'reset') { Object.keys(localStorage).filter((k) => k.startsWith('persona:')).forEach((k) => localStorage.removeItem(k)); void start(); }
  else void start(cmd as Entrance);
});

void start();
(globalThis as unknown as { persona: () => Companion | null }).persona = () => companion;
