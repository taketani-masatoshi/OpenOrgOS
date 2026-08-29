import { useEffect } from "react";
import { applyUiLocale, readUiLocale } from "./locale";

/** Keep html[lang] / data-locale in sync with the stored preference. */
export function LocaleSync() {
  useEffect(() => {
    applyUiLocale(readUiLocale());
  }, []);
  return null;
}
