import { describe, expect, it } from 'vitest';
import { DesktopStore } from '../../src/hosts/windows/store';
import { Repository } from '../../src/core/settings/store';

class TestStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('desktop persistence using the shared Repository', () => {
  it('keeps settings across adapter recreation, falls back to Pip, and leaves Chrome data alone', async () => {
    const storage = new TestStorage();
    storage.setItem('settings', 'chrome-data');
    const repo = new Repository(new DesktopStore(storage));
    await repo.ensureDefaults();
    await repo.saveSettings({ userName: 'Tanguy', scale: 1.25, activeProfileId: 'deleted-profile' });
    const reopened = new Repository(new DesktopStore(storage));
    expect((await reopened.getSettings()).userName).toBe('Tanguy');
    expect((await reopened.getSettings()).scale).toBe(1.25);
    expect((await reopened.getActiveCharacter()).profile.id).toBe('builtin:pip');
    expect(storage.getItem('settings')).toBe('chrome-data');
  });

  it('preserves unrelated keys on removal and exposes corruption or write failures', async () => {
    const storage = new TestStorage();
    const store = new DesktopStore(storage);
    await store.set('a', { value: 1 });
    await store.set('b', [2]);
    await store.remove('a');
    expect(await store.getMany(['a', 'b', 'missing'])).toEqual({ b: [2] });
    storage.setItem('persona:desktop:settings', '{bad-json');
    await expect(new Repository(store).getSettings()).rejects.toThrow();
    storage.setItem = () => { throw new Error('quota exceeded'); };
    await expect(store.set('new', 1)).rejects.toThrow('quota exceeded');
  });
});
