/**
 * Shared demo exclusion for L1 KPI views.
 */
export function excludeDemo<T extends { demo?: boolean }>(
  items: T[],
  includeDemo: boolean,
): T[] {
  if (includeDemo) return items;
  return items.filter((item) => item.demo !== true);
}
