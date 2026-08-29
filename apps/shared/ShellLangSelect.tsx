import { applyUiLocale } from "./locale";
import { SETTINGS_COPY } from "./console-copy";
import { useCopy } from "./define-copy";
import { useUiLocale } from "./useUiLocale";

/** Compact header language control — same `.lang-select` chrome as Community / oorgos.org. */
export function ShellLangSelect() {
  const locale = useUiLocale();
  const copy = useCopy(SETTINGS_COPY);

  return (
    <select
      className="lang-select"
      value={locale}
      aria-label={copy.languageLegend}
      onChange={(e) => applyUiLocale(e.target.value === "en" ? "en" : "ja")}
    >
      <option value="ja">{copy.languageJa}</option>
      <option value="en">{copy.languageEn}</option>
    </select>
  );
}
