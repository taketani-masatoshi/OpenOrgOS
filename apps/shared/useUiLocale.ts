import { useEffect, useState } from "react";
import { readUiLocale, subscribeUiLocale, type UiLocale } from "./locale";

export function useUiLocale(): UiLocale {
  const [locale, setLocale] = useState<UiLocale>(() => {
    if (typeof document === "undefined") return "ja";
    return readUiLocale();
  });

  useEffect(() => {
    setLocale(readUiLocale());
    return subscribeUiLocale(() => setLocale(readUiLocale()));
  }, []);

  return locale;
}
