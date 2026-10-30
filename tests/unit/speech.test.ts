import { describe, expect, it } from 'vitest';
import { candidateTiers, composeLine, fillTemplate, planGreeting, remember, timeSlot, EMPTY_MEMORY, lineKey } from '../../src/core/profile/speech';
import { PHRASEBOOK } from '../../src/core/profile/phrasebook';
import { normalizeProfile } from '../../src/core/profile/validate';
import { LANGUAGES, SPEECH_KINDS, TIME_SLOTS, TONES, type CharacterProfile } from '../../src/core/profile/types';
import { seededRng } from '../../src/core/rng';

const at = (h: number, m = 0, day = 15) => new Date(2026, 9, day, h, m); // 15 Oct 2026 = Thursday
const profile = (over: Partial<CharacterProfile> = {}): CharacterProfile =>
  normalizeProfile({ name: 'Nova', language: 'fr', tone: 'cheerful', ...over }).value;

describe('timeSlot', () => {
  it.each([
    [4, 'night'], [5, 'morning'], [11, 'morning'], [12, 'afternoon'], [17, 'afternoon'],
    [18, 'evening'], [21, 'evening'], [22, 'night'], [0, 'night'],
  ] as const)('%i h → %s', (h, slot) => {
    expect(timeSlot(at(h))).toBe(slot);
  });
});

describe('fillTemplate', () => {
  const vars = { name: 'Nova', user: 'Tanguy', day: 'jeudi', time: '09:05' };
  it('fills plain and optional placeholders', () => {
    expect(fillTemplate('Bonjour{,user} ! Ici {name}, {day} {time}.', vars)).toBe('Bonjour, Tanguy ! Ici Nova, jeudi 09:05.');
  });
  it('drops the optional placeholder when the user name is unknown', () => {
    expect(fillTemplate('Bonjour{,user} !', { ...vars, user: undefined })).toBe('Bonjour !');
  });
  it('rejects templates needing a missing value', () => {
    expect(fillTemplate('Salut {user} !', { ...vars, user: undefined })).toBeNull();
    expect(fillTemplate('Tu es sur {site}', vars)).toBeNull();
  });
});

describe('phrasebook coverage', () => {
  it('has lines for every language, slot, kind and tone', () => {
    for (const lang of LANGUAGES) {
      const book = PHRASEBOOK[lang];
      expect(book.weekdays).toHaveLength(7);
      for (const slot of TIME_SLOTS) {
        expect(book.greeting[slot].default.length, `${lang}/${slot}`).toBeGreaterThan(0);
        for (const tone of TONES) expect(book.greeting[slot][tone]?.length, `${lang}/${slot}/${tone}`).toBeGreaterThan(0);
      }
      for (const kind of SPEECH_KINDS) {
        if (kind === 'greeting') continue;
        expect(book[kind].default.length, `${lang}/${kind}`).toBeGreaterThan(0);
      }
    }
  });

  it('every built-in template can be filled when all values are known', () => {
    const vars = { name: 'N', user: 'U', site: 's.fr', day: 'd', time: 't' };
    for (const lang of LANGUAGES) {
      const lines = JSON.stringify(PHRASEBOOK[lang]).match(/"[^"]*\{[^"]*"/g) ?? [];
      for (const l of lines) expect(fillTemplate(JSON.parse(l), vars), l).not.toBeNull();
    }
  });
});

describe('composeLine', () => {
  it('speaks the profile language', () => {
    const fr = composeLine('greeting', { profile: profile({ language: 'fr', tone: 'calm' }), now: at(9), rng: seededRng(1) })!;
    const en = composeLine('greeting', { profile: profile({ language: 'en', tone: 'calm' }), now: at(9), rng: seededRng(1) })!;
    const pool = (lang: 'fr' | 'en') => [...PHRASEBOOK[lang].greeting.morning.default, ...PHRASEBOOK[lang].greeting.morning.calm!]
      .map((tpl) => fillTemplate(tpl, { name: 'Nova', day: PHRASEBOOK[lang].weekdays[4]!, time: '09:00' }));
    expect(pool('fr')).toContain(fr.text);
    expect(pool('en')).toContain(en.text);
  });

  it('uses the time of day', () => {
    const p = profile({ tone: 'grumpy' });
    const night = new Set<string>();
    for (let s = 0; s < 40; s++) night.add(composeLine('greeting', { profile: p, now: at(23, 30), rng: seededRng(s) })!.key);
    const nightKeys = new Set([...PHRASEBOOK.fr.greeting.night.default, ...PHRASEBOOK.fr.greeting.night.grumpy!].map((t) => lineKey('greeting', t)));
    for (const k of night) expect(nightKeys.has(k)).toBe(true);
  });

  it('varies with personality (tone)', () => {
    const lines = (tone: CharacterProfile['tone']) => {
      const out = new Set<string>();
      for (let s = 0; s < 60; s++) out.add(composeLine('click', { profile: profile({ tone }), now: at(15), rng: seededRng(s) })!.text);
      return out;
    };
    const grumpy = lines('grumpy');
    const cheerful = lines('cheerful');
    expect([...grumpy].some((l) => PHRASEBOOK.fr.click.grumpy!.includes(l))).toBe(true);
    expect([...cheerful].some((l) => PHRASEBOOK.fr.click.grumpy!.includes(l))).toBe(false);
  });

  it('prefers the profile’s own phrases', () => {
    const p = profile({ phrases: { click: ['Ma réplique perso'] } });
    let own = 0;
    for (let s = 0; s < 100; s++) if (composeLine('click', { profile: p, now: at(15), rng: seededRng(s) })!.text === 'Ma réplique perso') own++;
    expect(own).toBeGreaterThan(40);
  });

  it('avoids repeating recent lines', () => {
    const p = profile();
    const first = composeLine('again', { profile: p, now: at(15), rng: seededRng(3) })!;
    for (let s = 0; s < 30; s++) {
      expect(composeLine('again', { profile: p, now: at(15), rng: seededRng(s), recent: [first.key] })!.key).not.toBe(first.key);
    }
  });

  it('still answers when every line was said recently', () => {
    const p = profile();
    const tiers = candidateTiers('bye', p, at(15));
    const all = [...tiers.custom, ...tiers.tone, ...tiers.default].map((t) => lineKey('bye', t));
    expect(composeLine('bye', { profile: p, now: at(15), rng: seededRng(1), recent: all })).not.toBeNull();
  });

  it('greets the user by name when known', () => {
    const p = profile({ phrases: { greeting: { any: ['Salut {user} !'] } } });
    const texts = new Set<string>();
    for (let s = 0; s < 50; s++) texts.add(composeLine('greeting', { profile: p, now: at(10), rng: seededRng(s), userName: 'Tanguy' })!.text);
    expect(texts.has('Salut Tanguy !')).toBe(true);
    for (let s = 0; s < 50; s++) expect(composeLine('greeting', { profile: p, now: at(10), rng: seededRng(s) })!.text).not.toContain('{');
  });

  it('adds weekend greetings on Saturday', () => {
    const tiers = candidateTiers('greeting', profile(), at(10, 0, 17));
    expect(tiers.weekend.length).toBeGreaterThan(0);
    expect(candidateTiers('greeting', profile(), at(10)).weekend).toHaveLength(0);
  });
});

describe('greeting plan', () => {
  const cooldown = 30 * 60_000;
  it('greets fully the first time and after the cooldown', () => {
    expect(planGreeting(EMPTY_MEMORY, 1_000_000, cooldown)).toBe('greeting');
    expect(planGreeting({ lastGreetingAt: 1_000, recent: [] }, 1_000 + cooldown + 1, cooldown)).toBe('greeting');
  });
  it('stays quiet for pages opened in quick succession, then says “welcome back”', () => {
    const m = { lastGreetingAt: 1_000_000, recent: [] };
    expect(planGreeting(m, 1_000_000 + 30_000, cooldown)).toBeNull();
    expect(planGreeting(m, 1_000_000 + 5 * 60_000, cooldown)).toBe('again');
  });
  it('remembers recent lines and the last greeting time', () => {
    const m = remember(EMPTY_MEMORY, { key: 'greeting:a', text: 'x' }, 42, true);
    expect(m).toEqual({ lastGreetingAt: 42, recent: ['greeting:a'] });
    expect(remember(m, { key: 'click:b', text: 'y' }, 50, false)).toEqual({ lastGreetingAt: 42, recent: ['click:b', 'greeting:a'] });
  });
});
