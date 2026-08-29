/**
 * Bank CSV column presets for major JP banks + generic / two-column.
 */
import type { BankCsvColumnMapping } from "./bank-statement-import-service.js";
import { guessBankCsvColumnMapping } from "./bank-statement-import-service.js";

export type BankCsvPresetId =
  | "generic"
  | "mufg"
  | "mizuho"
  | "smbc"
  | "yucho"
  | "rakuten"
  | "two_column";

export type BankCsvPreset = {
  id: BankCsvPresetId;
  label: string;
  column_mapping: BankCsvColumnMapping;
  sample_header: string;
};

const PRESETS: BankCsvPreset[] = [
  {
    id: "generic",
    label: "汎用（OrgOS テンプレ）",
    sample_header:
      "date,direction,amount,category,description,account_id,reference,counterparty",
    column_mapping: {
      date: "date",
      amount: "amount",
      description: "description",
      direction: "direction",
    },
  },
  {
    id: "mufg",
    label: "三菱UFJ銀行",
    sample_header: "取引日,取引金額,摘要,入出金",
    column_mapping: {
      date: "取引日",
      amount: "取引金額",
      description: "摘要",
      direction: "入出金",
    },
  },
  {
    id: "mizuho",
    label: "みずほ銀行",
    sample_header: "取引日,金額,摘要,入出金",
    column_mapping: {
      date: "取引日",
      amount: "金額",
      description: "摘要",
      direction: "入出金",
    },
  },
  {
    id: "smbc",
    label: "三井住友銀行",
    sample_header: "日付,金額,摘要,入払区分",
    column_mapping: {
      date: "日付",
      amount: "金額",
      description: "摘要",
      direction: "入払区分",
    },
  },
  {
    id: "yucho",
    label: "ゆうちょ銀行",
    sample_header: "取扱日,お取扱金額,ご利用内容,入出金区分",
    column_mapping: {
      date: "取扱日",
      amount: "お取扱金額",
      description: "ご利用内容",
      direction: "入出金区分",
    },
  },
  {
    id: "rakuten",
    label: "楽天銀行",
    sample_header: "取引日,金額,内容,入出金",
    column_mapping: {
      date: "取引日",
      amount: "金額",
      description: "内容",
      direction: "入出金",
    },
  },
  {
    id: "two_column",
    label: "出金額・入金額（2列）",
    sample_header: "取引日,出金額,入金額,摘要",
    column_mapping: {
      date: "取引日",
      amount: "出金額",
      description: "摘要",
      withdrawal_amount: "出金額",
      deposit_amount: "入金額",
    },
  },
];

export function listBankCsvPresets(): BankCsvPreset[] {
  return PRESETS.map((p) => ({ ...p, column_mapping: { ...p.column_mapping } }));
}

export function resolveBankCsvPreset(id: string): BankCsvPreset | null {
  const hit = PRESETS.find((p) => p.id === id);
  if (!hit) return null;
  return { ...hit, column_mapping: { ...hit.column_mapping } };
}

/** Preset wins over guessed/manual mapping when a known preset id is set. */
export function mappingForPresetOrGuess(
  presetId: string | undefined,
  csvText: string,
): BankCsvColumnMapping {
  if (presetId) {
    const preset = resolveBankCsvPreset(presetId);
    if (preset) return { ...preset.column_mapping };
  }
  return guessBankCsvColumnMapping(csvText);
}
