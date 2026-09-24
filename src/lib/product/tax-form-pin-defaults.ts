/**
 * Default form-pin collation rows for Steward Chat (no tenant projection yet).
 * Corporate and sole-prop pins are composed separately for clear lane boundaries.
 */

/** Caller-supplied collation — product code does not read tests/fixtures. */
export type FormPinCollation = {
  id: string;
  label: string;
  /** False when no pin (label / form-line / fixture) is available. */
  pinPresent: boolean;
  /** False when books projection is not available yet. */
  projectedReady: boolean;
  /** Number of mismatched rows; 0 means empty diff when pin+projection ready. */
  diffCount: number;
};

/** Companies Act + schedule 4 + corporate local tax. */
export function defaultCorporateFormPinCollations(): FormPinCollation[] {
  return [
    {
      id: "companies-act-yen",
      label: "会社計算規則 表示ピン",
      pinPresent: true,
      projectedReady: false,
      diffCount: 0,
    },
    {
      id: "schedule4-yen",
      label: "別表四 記載例ピン",
      pinPresent: true,
      projectedReady: false,
      diffCount: 0,
    },
    {
      id: "corp-local-yen",
      label: "法人地方税 印刷円",
      pinPresent: true,
      projectedReady: false,
      diffCount: 0,
    },
  ];
}

/** Sole-prop local tax + consumption + blue return. */
export function defaultSolePropFormPinCollations(): FormPinCollation[] {
  return [
    {
      id: "sole-local-yen",
      label: "個人地方税 印刷円",
      pinPresent: true,
      projectedReady: false,
      diffCount: 0,
    },
    {
      id: "consumption-formula",
      label: "消費税 算式ピン",
      pinPresent: true,
      projectedReady: false,
      diffCount: 0,
    },
    {
      id: "consumption-yen",
      label: "消費税 円ピン",
      pinPresent: true,
      projectedReady: false,
      diffCount: 0,
    },
    {
      id: "blue-return-yen",
      label: "青色申告 手引き円",
      pinPresent: true,
      projectedReady: false,
      diffCount: 0,
    },
  ];
}

export function defaultFormPinCollations(): FormPinCollation[] {
  return [
    ...defaultCorporateFormPinCollations(),
    ...defaultSolePropFormPinCollations(),
  ];
}
