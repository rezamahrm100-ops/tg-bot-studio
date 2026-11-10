import { describe, expect, test } from 'bun:test';
import { buttonLabel, categoryCounts, getPage } from './operator-view';

describe('dynamic Telegram operator UI', () => {
  test('bot list pagination never produces impossible pages', () => {
    expect(getPage(0, 5, 7)).toEqual({ current: 0, pages: 1 });
    expect(getPage(21, 1, 7)).toEqual({ current: 1, pages: 3 });
    expect(getPage(21, 100, 7)).toEqual({ current: 2, pages: 3 });
    expect(getPage(21, -5, 7)).toEqual({ current: 0, pages: 3 });
    expect(getPage(21, Number.NaN, 7)).toEqual({ current: 0, pages: 3 });
  });

  test('Telegram button labels omit multiline and bidi overrides', () => {
    expect(buttonLabel('Bot\nName\u202e', 40)).toBe('Bot Name');
    expect(buttonLabel('123456789', 4)).toBe('1234');
  });

  test('module category menus are generated from the live engine response', () => {
    const modules = [
      { category: 'Community & Moderation', isEnabled: true },
      { category: 'Community & Moderation', isEnabled: false },
      { category: 'Future Core Category', isEnabled: true },
    ];
    expect(categoryCounts(modules)).toEqual([
      { name: 'Community & Moderation', count: 2, enabled: 1 },
      { name: 'Future Core Category', count: 1, enabled: 1 },
    ]);
    expect(categoryCounts([])).toEqual([]);
  });
});
