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

const DATABASE_STORE = 'kv';
const MIGRATION_KEY = '__legacy_local_storage_migrated__';
const LEGACY_PREFIX = 'persona:desktop:';

/**
 * Persistent desktop assets use IndexedDB rather than localStorage's small quota.
 * Existing installations are migrated once, in one transaction; their legacy data
 * stays intact as a recovery copy. Database errors are deliberately not hidden.
 */
export class IndexedDesktopStore implements KeyValueStore {
  private database: Promise<IDBDatabase> | undefined;
  private initialization: Promise<void> | undefined;
  private closed = false;

  constructor(private legacyStorage: Storage, private databaseName = 'persona-desktop') {}

  ready(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Le stockage Persona est fermé.'));
    return this.initialization ??= this.initialize();
  }

  private open(): Promise<IDBDatabase> {
    return this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      let abandoned = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DATABASE_STORE)) request.result.createObjectStore(DATABASE_STORE);
      };
      request.onerror = () => reject(request.error ?? new Error('Impossible d’ouvrir le stockage Persona.'));
      request.onblocked = () => { abandoned = true; reject(new Error('Fermez les autres fenêtres Persona pour mettre à jour le stockage.')); };
      request.onsuccess = () => {
        const db = request.result;
        if (this.closed || abandoned) { db.close(); reject(new Error('Le stockage Persona est fermé.')); return; }
        db.onversionchange = () => this.close();
        resolve(db);
      };
    });
  }

  private transaction<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      let value: T;
      let transaction: IDBTransaction;
      try { transaction = db.transaction(DATABASE_STORE, mode); }
      catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(transaction.error ?? new Error('L’enregistrement Persona a été interrompu.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Impossible d’enregistrer les données Persona.'));
      try { work(transaction.objectStore(DATABASE_STORE), (next) => { value = next; }); }
      catch (error) { transaction.abort(); reject(error); }
    });
  }

  private async initialize(): Promise<void> {
    const db = await this.open();
    const migrated = await this.transaction<unknown>(db, 'readonly', (store, result) => {
      const request = store.get(MIGRATION_KEY);
      request.onsuccess = () => result(request.result);
    });
    if (migrated === true) return;

    // Parse before opening the write transaction. One corrupt record must not
    // leave a partial migration, and parsing never changes the legacy backup.
    const entries: [string, unknown][] = [];
    for (let index = 0; index < this.legacyStorage.length; index++) {
      const key = this.legacyStorage.key(index);
      if (!key?.startsWith(LEGACY_PREFIX) || key === `${LEGACY_PREFIX}welcome-done`) continue;
      const raw = this.legacyStorage.getItem(key);
      if (raw !== null) {
        try { entries.push([key.slice(LEGACY_PREFIX.length), JSON.parse(raw)]); }
        catch { throw new Error(`Données Persona illisibles dans « ${key.slice(LEGACY_PREFIX.length)} ». La copie d’origine est conservée.`); }
      }
    }
    await this.transaction<void>(db, 'readwrite', (store, result) => {
      // Recheck inside the transaction for two simultaneous first launches.
      const marker = store.get(MIGRATION_KEY);
      marker.onsuccess = () => {
        if (marker.result === true) { result(); return; }
        for (const [key, value] of entries) {
          const existing = store.count(key);
          existing.onsuccess = () => { if (existing.result === 0) store.put(value, key); };
        }
        store.put(true, MIGRATION_KEY);
        result();
      };
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    await this.ready();
    return this.transaction<T | undefined>(await this.open(), 'readonly', (store, result) => {
      const request = store.get(key);
      request.onsuccess = () => result(request.result as T | undefined);
    });
  }

  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    await this.ready();
    return this.transaction<Record<string, unknown>>(await this.open(), 'readonly', (store, result) => {
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => { if (request.result !== undefined) Object.defineProperty(out, key, { value: request.result, enumerable: true, configurable: true }); };
      }
      result(out);
    });
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.ready();
    await this.transaction<void>(await this.open(), 'readwrite', (store, result) => { store.put(value, key); result(); });
  }

  async remove(key: string): Promise<void> {
    await this.ready();
    await this.transaction<void>(await this.open(), 'readwrite', (store, result) => { store.delete(key); result(); });
  }

  close(): void {
    this.closed = true;
    if (this.database) void this.database.then((db) => db.close()).catch(() => {});
  }
}
