/** Operator Console copy: Japanese when the browser asks for it. */
export function prefersJapaneseLocale(
  languages: readonly string[] | undefined = typeof navigator !== "undefined"
    ? navigator.languages?.length
      ? navigator.languages
      : [navigator.language]
    : undefined,
): boolean {
  if (!languages?.length) return true;
  return languages.some((value) => value.toLowerCase().startsWith("ja"));
}
