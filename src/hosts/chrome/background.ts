import { repo, type PersonaMessage } from './chromeStore';

/** Chrome Host — service worker: install defaults, keyboard shortcut, opening settings. */

async function injectIntoOpenTabs() {
  // Pages opened before the install do not have the content script yet.
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.allSettled(
    tabs.filter((t) => t.id !== undefined && !t.discarded).map((t) =>
      chrome.scripting.executeScript({ target: { tabId: t.id! }, files: ['content.js'] })),
  );
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await repo.ensureDefaults();
  if (details.reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
  await injectIntoOpenTabs();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-companion') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'persona:toggle-hidden' } satisfies PersonaMessage);
  } catch {
    // No companion on this page (browser page, disabled site…).
  }
});

chrome.runtime.onMessage.addListener((msg: PersonaMessage) => {
  if (msg?.type === 'persona:open-options') void chrome.runtime.openOptionsPage();
  return false;
});
