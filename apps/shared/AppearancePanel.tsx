import { useEffect, useState } from "react";
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from "./theme";
import { SETTINGS_COPY } from "./console-copy";
import { useCopy } from "./define-copy";
import { SettingsAccordionItem } from "./SettingsAccordionItem";

const OPTIONS: Array<{
  value: ThemePreference;
  swatch: "light" | "dark" | "system";
  labelKey: "light" | "dark" | "system";
  hintKey: "lightHint" | "darkHint" | "systemHint";
}> = [
  { value: "light", swatch: "light", labelKey: "light", hintKey: "lightHint" },
  { value: "dark", swatch: "dark", labelKey: "dark", hintKey: "darkHint" },
  { value: "system", swatch: "system", labelKey: "system", hintKey: "systemHint" },
];

export function AppearancePanel() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const copy = useCopy(SETTINGS_COPY);

  useEffect(() => {
    setPreference(readThemePreference());
  }, []);

  function select(next: ThemePreference) {
    setPreference(next);
    applyThemePreference(next);
  }

  const selected = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[2];

  return (
    <SettingsAccordionItem
      id="appearance"
      title={copy.appearance}
      status={copy[selected.labelKey]}
    >
      <fieldset className="theme-picker">
        <legend className="theme-picker-legend">{copy.appearanceLegend}</legend>
        {OPTIONS.map((option) => (
          <label key={option.value} className="theme-picker-option">
            <input
              type="radio"
              name="appearance"
              value={option.value}
              checked={preference === option.value}
              onChange={() => select(option.value)}
            />
            <span className={`theme-picker-swatch is-${option.swatch}`} aria-hidden="true" />
            <span className="theme-picker-copy">
              <strong>{copy[option.labelKey]}</strong>
              <span>{copy[option.hintKey]}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </SettingsAccordionItem>
  );
}
