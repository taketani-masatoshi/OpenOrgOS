import { readUiLocale } from "./locale";

/**
 * Operator Console copy language.
 * Stored preference (default ja) wins. A languages list is only for tests /
 * explicit navigator checks.
 */
export function prefersJapaneseLocale(
  languages?: readonly string[],
): boolean {
  if (languages) {
    if (!languages.length) return true;
    return languages.some((value) => value.toLowerCase().startsWith("ja"));
  }
  if (typeof document !== "undefined") {
    return readUiLocale() === "ja";
  }
  return true;
}
