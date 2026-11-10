import { describe, expect, test } from 'bun:test';
import {
  readOperatorPreferences,
  validateOperatorPreferences,
  validFavoriteModuleKey,
} from './operator-preferences';

describe('operator presentation preferences', () => {
  test('missing/corrupt preferences fall back to safe defaults', () => {
    expect(readOperatorPreferences(null)).toEqual({ compactMode: false, favoriteModules: [] });
    expect(readOperatorPreferences('{broken')).toEqual({
      compactMode: false,
      favoriteModules: [],
    });
    expect(readOperatorPreferences(JSON.stringify({ compactMode: true, favoriteModules: ['welcome'] })))
      .toEqual({ compactMode: true, favoriteModules: ['welcome'] });
  });

  test('accepts only bounded, unique, simple module keys', () => {
    expect(validFavoriteModuleKey('future_module-v2:rule')).toBe(true);
    expect(validFavoriteModuleKey('../../bad')).toBe(false);
    expect(() =>
      validateOperatorPreferences({ compactMode: true, favoriteModules: ['welcome', 'welcome'] }),
    ).toThrow();
    expect(() =>
      validateOperatorPreferences({
        compactMode: false,
        favoriteModules: Array.from({ length: 21 }, (_, i) => 'm' + i),
      }),
    ).toThrow();
    expect(() =>
      validateOperatorPreferences({ compactMode: false, favoriteModules: [], admin: true }),
    ).toThrow();
    expect(() =>
      validateOperatorPreferences({ compactMode: 'true', favoriteModules: [] }),
    ).toThrow();
  });

  test('does not mutate caller arrays', () => {
    const favorites = ['welcome'];
    const result = validateOperatorPreferences({ compactMode: false, favoriteModules: favorites });
    result.favoriteModules.push('future');
    expect(favorites).toEqual(['welcome']);
  });
});
