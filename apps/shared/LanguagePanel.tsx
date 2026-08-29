import { applyUiLocale, type UiLocale } from "./locale";
import { SETTINGS_COPY } from "./console-copy";
import { useCopy } from "./define-copy";
import { SettingsAccordionItem } from "./SettingsAccordionItem";
import { useUiLocale } from "./useUiLocale";

export function LanguagePanel() {
  const locale = useUiLocale();
  const copy = useCopy(SETTINGS_COPY);

  function select(next: UiLocale) {
    applyUiLocale(next);
  }

  return (
    <SettingsAccordionItem
      id="language"
      title={copy.language}
      status={locale === "ja" ? copy.languageJa : copy.languageEn}
    >
      <label className="locale-picker">
        <span className="theme-picker-legend">{copy.languageLegend}</span>
        <select
          className="lang-select"
          value={locale}
          aria-label={copy.languageLegend}
          onChange={(e) => select(e.target.value === "en" ? "en" : "ja")}
        >
          <option value="ja">{copy.languageJa}</option>
          <option value="en">{copy.languageEn}</option>
        </select>
      </label>
    </SettingsAccordionItem>
  );
}
