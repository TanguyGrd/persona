import type { KeyValueStore } from './settings/store';

/**
 * Host contract. A host puts the companion on screen and wires it to its platform:
 *  - Chrome Host  (src/hosts/chrome): content script inside web pages, chrome.storage.
 *  - Windows Host (src/hosts/windows, planned): transparent always-on-top window above
 *    other applications, JSON file storage.
 * The web stage (src/stage) only needs the services below, so both hosts share it.
 */
export interface HostServices {
  store: KeyValueStore;
  /** Open the settings UI. */
  openSettings(): void;
  /** Stop showing the companion on the current site / app (optional per host). */
  disableHere?(): void;
  /** Identifier of where we are (host name for the web, app name on desktop). */
  placeName(): string;
}
