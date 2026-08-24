import { useEffect } from "react";
import { applyThemePreference, readThemePreference } from "./theme";

/** Keep html[data-theme] in sync with the stored preference, including system changes. */
export function ThemeSync() {
  useEffect(() => {
    applyThemePreference(readThemePreference());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readThemePreference() === "system") applyThemePreference("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return null;
}
