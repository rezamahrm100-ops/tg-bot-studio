/** Regression gate: Persian dashboard coverage, technical literals and RTL safety. */
import { describe, expect, it } from 'bun:test';
import en from '../locales/en.json';
import fa from '../locales/fa.json';
import modulesEn from '../locales/modules.en.json';
import modulesFa from '../locales/modules.fa.json';

type Leaves = Record<string, string>;
function leaves(source: unknown, prefix = ''): Leaves {
  if (typeof source === 'string') return { [prefix]: source };
  if (Array.isArray(source)) {
    return Object.assign({}, ...source.map((part, i) => leaves(part, prefix + '[' + i + ']')));
  }
  if (source && typeof source === 'object') {
    return Object.assign(
      {},
      ...Object.entries(source).map(([key, value]) =>
        leaves(value, prefix ? prefix + '.' + key : key),
      ),
    );
  }
  throw new Error('Locale values must be strings, arrays or dictionaries');
}

const catalogs: Array<[string, Leaves, Leaves]> = [
  ['shell', leaves(en), leaves(fa)],
  ['modules', leaves(modulesEn), leaves(modulesFa)],
];

// These are identifiers, dynamic placeholder examples and literal JSON, not prose.
const INTENTIONALLY_UNTRANSLATED = new Set([
  'shell:support.mediaTypePlaceholder',
  'shell:broadcast.buttonsExample',
  'shell:visual.jsonTab',
  'shell:visual.typeUrl',
  'shell:webhooks.url',
  'shell:mediaLibrary.sourceUrl',
  'shell:flows.triggerStart',
  'shell:scanAccounts.wizard.stepPassword',
  'shell:scanAccounts.wizard.apiHash',
  'modules:start-menu.fields.url.label',
  'modules:start-menu.columns.url',
  'modules:scheduler.fields.buttons.help',
]);

const placeholders = (text: string) =>
  (text.match(/\{\{[^{}]+\}\}|\{[^{}]+\}/g) ?? []).sort();

describe('Persian dashboard full-catalog candidate', () => {
  it('keeps every source key and all original interpolation variables intact', () => {
    for (const [, english, persian] of catalogs) {
      expect(Object.keys(persian).sort()).toEqual(Object.keys(english).sort());
      for (const [key, value] of Object.entries(english)) {
        expect(placeholders(persian[key])).toEqual(placeholders(value));
      }
    }
  });

  it('has Persian prose for all keys except exact, documented technical literals', () => {
    const actualExceptions: string[] = [];
    let count = 0;
    for (const [name, english, persian] of catalogs) {
      for (const [key, value] of Object.entries(english)) {
        count++;
        const translated = persian[key];
        expect(translated.trim().length).toBeGreaterThan(0);
        if (translated === value) actualExceptions.push(name + ':' + key);
        else expect(/[\u0600-\u06ff]/.test(translated)).toBe(true);
        expect(/[\u202a-\u202e\u2066-\u2069]/.test(translated)).toBe(false);
      }
    }
    expect(count).toBe(1697);
    expect(actualExceptions.sort()).toEqual([...INTENTIONALLY_UNTRANSLATED].sort());
  });

  it('does not translate executable JSON button examples', () => {
    expect(fa.broadcast.buttonsExample).toBe(en.broadcast.buttonsExample);
    expect(modulesFa.scheduler.fields.buttons.help).toBe(
      modulesEn.scheduler.fields.buttons.help,
    );
    expect(JSON.parse(fa.broadcast.buttonsExample)).toEqual(
      JSON.parse(en.broadcast.buttonsExample),
    );
  });
});
