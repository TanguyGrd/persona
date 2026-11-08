import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { startDesktop } from './desktop';

if (!isTauri()) {
  const error = document.querySelector<HTMLElement>('#error')!;
  error.textContent = 'Lancez Persona avec npm run desktop:dev. Cette page seule ne crée pas de compagnon de bureau.';
  error.hidden = false;
} else {
  void startDesktop({ invoke, listen: async (event, handler) => listen(event, handler) });
}
