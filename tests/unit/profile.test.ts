import { describe, expect, it } from 'vitest';
import { normalizeProfile, normalizePhrases } from '../../src/core/profile/validate';
import { CachedProfileGenerator, LocalProfileGenerator, analyzeDescription, detectLanguage, type ProfileGenerator } from '../../src/core/profile/generator';
import { MemoryStore } from '../../src/core/settings/store';
import { BUILTIN_PROFILES } from '../../characters';

describe('normalizeProfile', () => {
  it('keeps a valid profile intact', () => {
    const pip = BUILTIN_PROFILES[0]!;
    const { value, warnings } = normalizeProfile(pip);
    expect(warnings).toEqual([]);
    expect(value).toEqual(pip);
  });

  it('repairs bad input and explains what it changed', () => {
    const { value, warnings } = normalizeProfile({ name: '', language: 'kl', tone: 'angry', traits: { energy: 7, sociability: -1 } });
    expect(value.name).toBe('Compagnon');
    expect(value.language).toBe('fr');
    expect(value.tone).toBe('cheerful');
    expect(value.traits).toEqual({ energy: 1, sociability: 0, playfulness: 0.5 });
    expect(warnings.length).toBe(3);
  });

  it('survives garbage', () => {
    expect(normalizeProfile(null).value.name).toBe('Compagnon');
    expect(normalizeProfile('x').warnings[0]).toMatch(/illisible/);
  });

  it('cleans phrases: trims, drops non-strings, accepts a flat greeting list', () => {
    expect(normalizePhrases({ click: ['  a ', 3, ''], greeting: ['salut'], bogus: ['x'] })).toEqual({ click: ['a'], greeting: { any: ['salut'] } });
    expect(normalizePhrases({ greeting: { morning: ['m'], noon: ['x'] } })).toEqual({ greeting: { morning: ['m'] } });
  });
});

describe('local profile generator', () => {
  const gen = new LocalProfileGenerator();

  it('detects language from the description', () => {
    expect(detectLanguage('Une petite renarde qui aime les blagues et la musique').language).toBe('fr');
    expect(detectLanguage('A grumpy old cat who loves the sun and naps').language).toBe('en');
    expect(detectLanguage('').sure).toBe(false);
  });

  it('infers tone and traits from keywords', () => {
    const a = analyzeDescription('Un lutin espiègle, farceur et très énergique, bavard comme une pie.');
    expect(a.tone).toBe('playful');
    expect(a.traits.energy).toBeGreaterThan(0.75);
    expect(a.traits.sociability).toBeGreaterThan(0.7);
    expect(analyzeDescription('A shy, quiet and reserved ghost').tone).toBe('shy');
    expect(analyzeDescription('Un robot grognon et sarcastique').tone).toBe('grumpy');
  });

  it('produces a usable generated profile with few uncertainties when the description is clear', async () => {
    const g = await gen.generate({ name: 'Luna', description: 'Une renarde joyeuse et énergique, très bavarde, qui adore rire avec ses amis.' });
    expect(g.profile).toMatchObject({ name: 'Luna', language: 'fr', tone: 'cheerful' });
    expect(g.profile.meta.source).toBe('generated');
    expect(g.profile.meta.generator).toBe('local-heuristic@1');
    expect(g.confidence).toBeGreaterThan(0.4);
    expect(g.uncertainties).toHaveLength(1); // only the "no online research" notice
  });

  it('lists what it could not establish and asks for manual correction', async () => {
    const g = await gen.generate({ name: 'Mystère', description: '' });
    expect(g.confidence).toBeLessThan(0.3);
    expect(g.uncertainties.join(' ')).toMatch(/recherche en ligne/);
    expect(g.uncertainties.join(' ')).toMatch(/Ton de voix non identifié/);
    expect(g.uncertainties.join(' ')).toMatch(/Langue non précisée/);
    expect(g.profile.meta.uncertainties).toEqual(g.uncertainties);
  });

  it('respects a forced language', async () => {
    const g = await gen.generate({ name: 'Bob', description: 'Une tortue calme', language: 'de' });
    expect(g.profile.language).toBe('de');
  });
});

describe('cached generator', () => {
  it('generates once per request, then serves the cache with a fresh id', async () => {
    let calls = 0;
    const inner: ProfileGenerator = {
      id: 'fake@1',
      async generate(req) { calls++; return new LocalProfileGenerator().generate(req); },
    };
    const store = new MemoryStore();
    const cached = new CachedProfileGenerator(inner, store);
    const a = await cached.generate({ name: 'Luna', description: 'joyeuse' });
    const b = await cached.generate({ name: 'Luna', description: 'joyeuse' });
    await cached.generate({ name: 'Luna', description: 'grognon' });
    expect(calls).toBe(2);
    expect(b.profile.tone).toBe(a.profile.tone);
    expect(b.profile.id).not.toBe(a.profile.id);
  });
});
