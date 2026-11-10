import { describe, expect, test } from 'bun:test';
import type { PrismaService } from '../database/prisma.service';
import {
  OperatorPreferencesService,
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
    expect(
      readOperatorPreferences(JSON.stringify({ compactMode: true, favoriteModules: ['welcome'] })),
    ).toEqual({ compactMode: true, favoriteModules: ['welcome'] });
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

describe('per-owner persistence', () => {
  test('independent operator IDs never share favorites or density', async () => {
    const storage = new Map<string, string>();
    const prisma = {
      systemSetting: {
        findUnique: async ({ where }: { where: { key: string } }) =>
          storage.has(where.key) ? { value: storage.get(where.key) } : null,
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { key: string };
          create: { key: string; value: string };
          update: { value: string };
        }) => {
          storage.set(where.key, storage.has(where.key) ? update.value : create.value);
        },
      },
    } as unknown as PrismaService;
    const service = new OperatorPreferencesService(prisma);
    await service.save(101, { compactMode: true, favoriteModules: ['welcome'] });
    expect(await service.get(202)).toEqual({ compactMode: false, favoriteModules: [] });
    expect(await service.toggleFavorite(101, 'welcome')).toEqual({
      compactMode: true,
      favoriteModules: [],
    });
    await service.toggleFavorite(202, 'future-core');
    expect(await service.get(202)).toEqual({
      compactMode: false,
      favoriteModules: ['future-core'],
    });
    expect(await service.get(101)).toEqual({ compactMode: true, favoriteModules: [] });
  });
});
