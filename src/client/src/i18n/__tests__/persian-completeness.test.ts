/** Regression gate: complete Persian dashboard catalog and technical literal safety. */
import { describe, expect, it } from 'bun:test';
import en from '../locales/en.json';
import fa from '../locales/fa.json';
import modulesEn from '../locales/modules.en.json';
import modulesFa from '../locales/modules.fa.json';

type Leaves = Record<string, string>;

function leaves(source: unknown): Leaves {
  const result: Leaves = {};
  function visit(node: unknown, path: string): void {
    if (typeof node === 'string') {
      result[path] = node;
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((value, index) => visit(value, path + '[' + index + ']'));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        visit(value, path ? path + '.' + key : key);
      }
      return;
    }
    throw new Error('Locale values must be strings, arrays, or dictionaries');
  }
  visit(source, '');
  return result;
}

const catalogs: [string, Leaves, Leaves][] = [
  ['shell', leaves(en), leaves(fa)],
  ['modules', leaves(modulesEn), leaves(modulesFa)],
];

// Technical identifiers and literal examples are not natural-language strings.
const TECHNICAL_EXCEPTIONS = new Set([
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

const tokens = (text: string) => (text.match(/\{\{[^{}]+\}\}|\{[^{}]+\}/g) ?? []).sort();
const lineBreaks = (text: string) => text.split('\n').length - 1;

describe('Persian dashboard catalog completeness', () => {
  it('preserves every source key, interpolation variable, and line break', () => {
    for (const [, english, persian] of catalogs) {
      expect(Object.keys(persian).sort()).toEqual(Object.keys(english).sort());
      for (const [key, value] of Object.entries(english)) {
        expect(tokens(persian[key])).toEqual(tokens(value));
        expect(lineBreaks(persian[key])).toBe(lineBreaks(value));
      }
    }
  });

  it('translates natural-language prose and preserves only documented technical exceptions', () => {
    const actualExceptions: string[] = [];
    let count = 0;
    for (const [name, english, persian] of catalogs) {
      for (const [key, original] of Object.entries(english)) {
        count++;
        const translated = persian[key];
        expect(translated.trim().length).toBeGreaterThan(0);
        if (translated === original) actualExceptions.push(name + ':' + key);
        else expect(/[\u0600-\u06ff]/.test(translated)).toBe(true);
        expect(/[\u202a-\u202e\u2066-\u2069]/.test(translated)).toBe(false);
      }
    }
    expect(count).toBe(1697);
    expect(actualExceptions.sort()).toEqual([...TECHNICAL_EXCEPTIONS].sort());
  });

  it('keeps executable JSON button examples unchanged', () => {
    expect(fa.broadcast.buttonsExample).toBe(en.broadcast.buttonsExample);
    expect(modulesFa.scheduler.fields.buttons.help).toBe(modulesEn.scheduler.fields.buttons.help);
    expect(JSON.parse(fa.broadcast.buttonsExample)).toEqual(
      JSON.parse(en.broadcast.buttonsExample),
    );
  });
});
