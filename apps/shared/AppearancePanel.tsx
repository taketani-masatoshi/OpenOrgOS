import { useEffect, useMemo, useState } from "react";
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from "./theme";
import { prefersJapaneseLocale } from "./ui-locale";

const COPY = {
  ja: {
    heading: "外観",
    lead: "画面全体のスタイルを切り替えます。この端末に保存され、oorgos.org 配下のサイトでも使われます。",
    legend: "スタイル",
    light: "ライト",
    lightHint: "明るい背景（oorgos.org と同じ）",
    dark: "ダーク",
    darkHint: "暗い場所向けの背景",
    system: "システムデフォルト",
    systemHint: "この端末のライト／ダーク設定に合わせる",
  },
  en: {
    heading: "Appearance",
    lead: "Switch the overall style. Saved on this device and reused across oorgos.org sites.",
    legend: "Style",
    light: "Light",
    lightHint: "Bright background, matching oorgos.org",
    dark: "Dark",
    darkHint: "Dim background for low light",
    system: "System default",
    systemHint: "Follow this device’s light or dark setting",
  },
} as const;

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
  const copy = useMemo(() => (prefersJapaneseLocale() ? COPY.ja : COPY.en), []);

  useEffect(() => {
    setPreference(readThemePreference());
  }, []);

  function select(next: ThemePreference) {
    setPreference(next);
    applyThemePreference(next);
  }

  return (
    <section className="passkey-settings-section" aria-labelledby="appearance-heading">
      <div className="passkey-settings-section-head">
        <h2 id="appearance-heading" className="passkey-settings-section-title">
          {copy.heading}
        </h2>
        <p className="passkey-settings-section-lead">{copy.lead}</p>
      </div>
      <fieldset className="theme-picker">
        <legend className="theme-picker-legend">{copy.legend}</legend>
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
    </section>
  );
}
