import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isSiteDisabled, normalizeHost, normalizeSettings, toggleSite } from '../../src/core/settings/settings';

describe('settings', () => {
  it('fills defaults', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ scale: 1.4 }).scale).toBe(1.4);
  });

  it('clamps and rejects invalid values', () => {
    const s = normalizeSettings({ scale: 99, frequency: 'insane', greetCooldownMin: -4, position: { xRatio: 3, yPx: -2 }, enabled: 'yes' });
    expect(s.scale).toBe(2);
    expect(s.frequency).toBe('normal');
    expect(s.greetCooldownMin).toBe(1);
    expect(s.position).toEqual({ xRatio: 1, yPx: 0 });
    expect(s.enabled).toBe(true);
  });

  it('normalises host names', () => {
    expect(normalizeHost('https://www.Example.com:8080/path?q')).toBe('example.com');
    expect(normalizeHost('  sub.site.fr ')).toBe('sub.site.fr');
  });

  it('disables sites, including wildcard sub-domains', () => {
    const s = normalizeSettings({ disabledSites: ['example.com', '*.bank.fr', 'www.news.org'] });
    expect(isSiteDisabled(s, 'example.com')).toBe(true);
    expect(isSiteDisabled(s, 'www.example.com')).toBe(true);
    expect(isSiteDisabled(s, 'other.example.com')).toBe(false);
    expect(isSiteDisabled(s, 'bank.fr')).toBe(true);
    expect(isSiteDisabled(s, 'my.online.bank.fr')).toBe(true);
    expect(isSiteDisabled(s, 'news.org')).toBe(true);
    expect(isSiteDisabled(s, 'notbank.fr')).toBe(false);
  });

  it('toggles a site on and off', () => {
    const off = toggleSite(DEFAULT_SETTINGS, 'www.site.com', true);
    expect(off.disabledSites).toEqual(['site.com']);
    expect(toggleSite(off, 'site.com', false).disabledSites).toEqual([]);
  });
});
