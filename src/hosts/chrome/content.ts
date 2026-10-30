import { Companion, HOST_TAG } from '../../stage/companion';
import { isSiteDisabled, type Settings } from '../../core/settings/settings';
import { KEYS } from '../../core/settings/store';
import type { SpeechMemory } from '../../core/profile/speech';
import type { Entrance } from '../../core/profile/types';
import { debounce, HIDDEN_KEY, repo, chromeStore, type PersonaMessage, type PersonaStatus } from './chromeStore';

/**
 * Chrome Host — content script. Shows the active character on compatible pages
 * (top-level http/https HTML documents; also the extension's own welcome page).
 */

const FLAG = '__personaCompanion';
const OWNER = 'persona-extension';
type G = typeof globalThis & { [FLAG]?: boolean };

function compatible(): boolean {
  if (window.top !== window) return false;
  if (document.contentType && document.contentType !== 'text/html') return false;
  return !!document.documentElement;
}

function alive(): boolean {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

let companion: Companion | null = null;
let settings: Settings | null = null;
let activeKey = '';
// Starts and storage reactions run one at a time, in order.
let queue: Promise<unknown> = Promise.resolve();
const enqueue = (fn: () => Promise<unknown>) => { queue = queue.then(fn).catch((e) => console.debug('[persona]', e)); };

const host = location.hostname;

async function start(entrance?: Entrance) {
  if (!alive()) return;
  {
    settings = await repo.getSettings();
    if (!settings.enabled || isSiteDisabled(settings, host)) return stop();
    const { profile, avatar } = await repo.getActiveCharacter(settings);
    const memory = await repo.getMemory(profile.id);
    const hidden = (await chromeStore.get<boolean>(HIDDEN_KEY)) === true;
    stop();
    activeKey = `${profile.id}|${avatar.id}`;
    const saveMemory = debounce((m: SpeechMemory) => { if (alive()) void repo.saveMemory(profile.id, m); }, 300);
    const savePosition = debounce((position: { xRatio: number; yPx: number }) => { if (alive()) void repo.saveSettings({ position }); }, 400);
    companion = new Companion({
      profile,
      avatar,
      settings,
      memory,
      entrance,
      startHidden: hidden,
      owner: OWNER,
      callbacks: {
        saveMemory,
        savePosition,
        openSettings: () => { if (alive()) void chrome.runtime.sendMessage({ type: 'persona:open-options' } satisfies PersonaMessage); },
        placeName: () => host.replace(/^www\./, ''),
        onHiddenChange: (h) => { if (alive()) void chromeStore.set(HIDDEN_KEY, h); },
      },
    }).mount();
  }
}

function stop() {
  companion?.destroy();
  companion = null;
  activeKey = '';
}

function onStorageChange(changes: Record<string, chrome.storage.StorageChange>) {
  if (!alive()) { stop(); return; }
  if (changes[HIDDEN_KEY] && companion) {
    const h = changes[HIDDEN_KEY].newValue === true;
    if (h !== companion.isHidden) { if (h) companion.hide(); else companion.show(); }
  }
  const touchesCharacter = Object.keys(changes).some((k) => k === KEYS.profiles || k.startsWith('avatar:'));
  if (!changes[KEYS.settings] && !touchesCharacter) return;
  enqueue(async () => {
    const next = await repo.getSettings();
    const prev = settings;
    settings = next;
    if (!next.enabled || isSiteDisabled(next, host)) return stop();
    if (!companion) return start(prev?.enabled === false ? 'pop' : undefined);
    const { profile, avatar } = await repo.getActiveCharacter(next);
    const key = `${profile.id}|${avatar.id}`;
    if (key !== activeKey || (touchesCharacter && changes[KEYS.profiles]) || (touchesCharacter && changes[KEYS.avatar(avatar.id)])) {
      return start('pop');
    }
    companion.updateSettings(next);
  });
}

function onMessage(msg: PersonaMessage, _sender: chrome.runtime.MessageSender, reply: (r: PersonaStatus) => void) {
  if (msg.type === 'persona:toggle-hidden') companion?.toggleHidden();
  if (msg.type === 'persona:talk') companion?.talk('idle');
  if (msg.type === 'persona:status' || msg.type === 'persona:toggle-hidden' || msg.type === 'persona:talk') {
    reply({ present: !!companion, hidden: companion?.isHidden ?? false, activity: companion?.activity ?? 'none' });
  }
  return false;
}

if (compatible() && !(globalThis as G)[FLAG]) {
  (globalThis as G)[FLAG] = true;
  // A copy left behind by a previous version of the extension: replace it.
  document.querySelectorAll(`${HOST_TAG}[data-owner="${OWNER}"]`).forEach((el) => el.remove());
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') onStorageChange(changes); });
  chrome.runtime.onMessage.addListener(onMessage);
  enqueue(() => start());
}
