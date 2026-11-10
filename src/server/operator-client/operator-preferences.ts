import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * A small, optional per-operator presentation layer. Core capabilities, bot
 * configuration and navigation are never stored or duplicated here.
 */
export interface OperatorPreferences {
  compactMode: boolean;
  favoriteModules: string[];
}

export const DEFAULT_OPERATOR_PREFERENCES: OperatorPreferences = {
  compactMode: false,
  favoriteModules: [],
};

const KEY_PREFIX = 'operator-ui:v1:';
const MAX_FAVORITES = 20;
const MODULE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/;

export function validFavoriteModuleKey(key: string): boolean {
  return MODULE_KEY.test(key);
}

/** Strictly validate client input before persisting preferences. */
export function validateOperatorPreferences(value: unknown): OperatorPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException('Invalid operator preferences');
  }
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some((key) => key !== 'compactMode' && key !== 'favoriteModules') ||
    typeof data.compactMode !== 'boolean' ||
    !Array.isArray(data.favoriteModules) ||
    data.favoriteModules.length > MAX_FAVORITES ||
    !data.favoriteModules.every(
      (key: unknown) => typeof key === 'string' && validFavoriteModuleKey(key),
    ) ||
    new Set(data.favoriteModules).size !== data.favoriteModules.length
  ) {
    throw new BadRequestException('Invalid operator preferences');
  }
  return {
    compactMode: data.compactMode,
    favoriteModules: [...data.favoriteModules] as string[],
  };
}

/** Reads corrupted or older records defensively without changing core state. */
export function readOperatorPreferences(raw: string | null | undefined): OperatorPreferences {
  if (!raw) return { ...DEFAULT_OPERATOR_PREFERENCES, favoriteModules: [] };
  try {
    return validateOperatorPreferences(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_OPERATOR_PREFERENCES, favoriteModules: [] };
  }
}

@Injectable()
export class OperatorPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(operatorId: number): Promise<OperatorPreferences> {
    const record = await this.prisma.systemSetting.findUnique({
      where: { key: KEY_PREFIX + operatorId },
    });
    return readOperatorPreferences(record?.value);
  }

  async save(operatorId: number, input: unknown): Promise<OperatorPreferences> {
    const value = validateOperatorPreferences(input);
    await this.prisma.systemSetting.upsert({
      where: { key: KEY_PREFIX + operatorId },
      create: { key: KEY_PREFIX + operatorId, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
    return value;
  }

  async toggleFavorite(operatorId: number, moduleKey: string): Promise<OperatorPreferences> {
    if (!validFavoriteModuleKey(moduleKey)) {
      throw new BadRequestException('Invalid module key');
    }
    const current = await this.get(operatorId);
    const favoriteModules = current.favoriteModules.includes(moduleKey)
      ? current.favoriteModules.filter((key) => key !== moduleKey)
      : [...current.favoriteModules, moduleKey];
    return this.save(operatorId, { ...current, favoriteModules });
  }
}
