import type { UiLocale } from "./locale";
import { useUiLocale } from "./useUiLocale";

export function defineCopy<T extends Record<string, unknown>>(
  ja: T,
  en: T,
): Record<UiLocale, T> {
  return { ja, en };
}

export function useCopy<T>(catalog: Record<UiLocale, T>): T {
  return catalog[useUiLocale()];
}
