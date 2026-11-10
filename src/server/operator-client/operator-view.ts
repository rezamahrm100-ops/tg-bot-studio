/** Presentation-only helpers. Every input is supplied by the live Studio core. */

export function buttonLabel(value: unknown, max = 35): string {
  return String(value ?? '')
    .replace(/[\n\r\t\u202a-\u202e]/g, ' ')
    .trim()
    .slice(0, max);
}

export function getPage(
  total: number,
  page: number,
  size: number,
): { current: number; pages: number } {
  const pages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, size)));
  const requested = Number.isFinite(page) ? Math.trunc(page) : 0;
  return { pages, current: Math.min(Math.max(0, requested), pages - 1) };
}

export interface CatalogCategory {
  name: string;
  count: number;
  enabled: number;
}

/** Unknown/future module categories appear automatically in native menus. */
export function categoryCounts(
  modules: readonly { category?: unknown; isEnabled?: unknown }[],
): CatalogCategory[] {
  const groups = new Map<string, CatalogCategory>();
  for (const module of modules) {
    const name = String(module.category || 'Other');
    const previous = groups.get(name) ?? { name, count: 0, enabled: 0 };
    groups.set(name, {
      name,
      count: previous.count + 1,
      enabled: previous.enabled + (module.isEnabled ? 1 : 0),
    });
  }
  return [...groups.values()];
}
