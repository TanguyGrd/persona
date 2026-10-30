import { isSiteDisabled, normalizeHost, toggleSite } from '../../../core/settings/settings';
import { HIDDEN_KEY, chromeStore, repo, type PersonaMessage, type PersonaStatus } from '../chromeStore';
import { avatarPreview, h, LANG_LABEL, TONE_LABEL } from '../ui';

const app = document.getElementById('app')!;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function send(tabId: number | undefined, msg: PersonaMessage): Promise<PersonaStatus | null> {
  if (tabId === undefined) return null;
  try { return (await chrome.tabs.sendMessage(tabId, msg)) as PersonaStatus; } catch { return null; }
}

async function render() {
  const settings = await repo.getSettings();
  const { profile, avatar } = await repo.getActiveCharacter(settings);
  const profiles = await repo.listProfiles();
  const hidden = (await chromeStore.get<boolean>(HIDDEN_KEY)) === true;
  const tab = await activeTab();
  let host = '';
  try { const u = new URL(tab?.url ?? ''); if (u.protocol === 'http:' || u.protocol === 'https:') host = normalizeHost(u.hostname); } catch { /* no url */ }
  const siteOn = host ? !isSiteDisabled(settings, host) : false;

  const preview = avatarPreview(avatar, 64);
  const enabled = h('input', { type: 'checkbox', class: 'switch', id: 'enabled', checked: settings.enabled,
    onchange: async (e: Event) => { await repo.saveSettings({ enabled: (e.target as HTMLInputElement).checked }); void render(); } });
  const site = h('input', { type: 'checkbox', class: 'switch', id: 'site', checked: siteOn, disabled: !host || !settings.enabled,
    onchange: async (e: Event) => {
      const on = (e.target as HTMLInputElement).checked;
      const s = await repo.getSettings();
      await repo.saveSettings(toggleSite(s, host, !on));
      void render();
    } });

  const select = h('select', { id: 'character', 'aria-label': 'Personnage',
    onchange: async (e: Event) => { await repo.saveSettings({ activeProfileId: (e.target as HTMLSelectElement).value }); void render(); } },
    ...profiles.map((p) => h('option', { value: p.id, selected: p.id === profile.id }, p.name)));

  const canAct = settings.enabled && siteOn;
  app.replaceChildren(
    h('section', { class: 'head' }, preview.el,
      h('div', { class: 'who' }, h('strong', {}, profile.name),
        h('span', { class: 'muted' }, `${TONE_LABEL[profile.tone] ?? profile.tone} · ${LANG_LABEL[profile.language] ?? profile.language}`))),
    h('div', { class: 'row' }, h('label', { for: 'enabled' }, 'Compagnon activé'), enabled),
    h('div', { class: 'row' }, h('label', { for: 'site' }, host ? `Actif sur ${host}` : 'Page non compatible'), site),
    h('div', { class: 'btns' },
      h('button', { id: 'toggle-hidden', disabled: !settings.enabled, onclick: async () => {
        const r = await send(tab?.id, { type: 'persona:toggle-hidden' });
        if (!r) await chromeStore.set(HIDDEN_KEY, !hidden);
        void render();
      } }, hidden ? 'Afficher' : 'Masquer'),
      h('button', { id: 'talk', class: 'primary', disabled: !canAct || hidden, onclick: () => void send(tab?.id, { type: 'persona:talk' }) }, 'Faire parler')),
    h('label', { class: 'muted', for: 'character' }, 'Personnage actif'),
    select,
    h('footer', {},
      h('a', { href: '#', id: 'open-options', onclick: (e: Event) => { e.preventDefault(); void chrome.runtime.openOptionsPage(); } }, 'Personnages et réglages →'),
      h('span', { class: 'muted' }, 'Gratuit · sans clé API')),
  );
}

void render();
