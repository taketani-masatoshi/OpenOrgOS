/**
 * Read-only tax lines / filing-gate summary for Steward Chat.
 * Never opens a government socket. Never invents receipt numbers or official yen.
 *
 * 更に厳格: form pin rows are books↔official-pin empty diffs when the caller
 * supplies both sides. Companies Act without an official yen pin stays unmet
 * (diff_empty false). Hard-0 self-probes are not treated as sufficiency.
 */
import { officialFilingProductStatus } from "../finance/filing/official-receipt.js";
import { taxModuleBoundaryNote } from "../tax/tax-handoff-package.js";

export type TaxLinePinDiffRow = {
  id: string;
  label: string;
  diff_empty: boolean;
  note: string;
};

/** Caller-supplied collation — product code does not read tests/fixtures. */
export type FormPinCollation = {
  id: string;
  label: string;
  /** False when no official printed-yen / form-line pin exists (e.g. Companies Act). */
  pinPresent: boolean;
  /** False when books projection is not available yet. */
  projectedReady: boolean;
  /** Number of mismatched rows; 0 means empty diff when pin+projection ready. */
  diffCount: number;
};

export type TaxLinesReadModel = {
  submission: "not-for-etax";
  boundary: string;
  filing: ReturnType<typeof officialFilingProductStatus>;
  lines: Array<{
    id: string;
    label: string;
    status: "ok" | "blocked" | "info";
    detail: string;
  }>;
  pin_diff_rows: TaxLinePinDiffRow[];
};

export function formPinCollationToRow(c: FormPinCollation): TaxLinePinDiffRow {
  if (!c.pinPresent) {
    return {
      id: c.id,
      label: c.label,
      diff_empty: false,
      note: "公式円ピン不在→法定未充足（捏造しない）",
    };
  }
  if (!c.projectedReady) {
    return {
      id: c.id,
      label: c.label,
      diff_empty: false,
      note: "帳簿投影未準備",
    };
  }
  return {
    id: c.id,
    label: c.label,
    diff_empty: c.diffCount === 0,
    note: c.diffCount === 0 ? "帳簿↔公式ピン空差分" : `差分 ${c.diffCount} 行`,
  };
}

/**
 * Default form rows when Chat has no tenant projection yet.
 * Companies Act: pin absent → unmet. Other lines: pin known in product but
 * projection not loaded → unmet until caller supplies collation.
 */
export function defaultFormPinCollations(): FormPinCollation[] {
  return [
    {
      id: "companies-act-yen",
      label: "会社計算規則 円ピン",
      pinPresent: false,
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

export function buildFormPinDiffRows(
  collations: FormPinCollation[] = defaultFormPinCollations(),
): TaxLinePinDiffRow[] {
  return collations.map(formPinCollationToRow);
}

export function buildLivePinDiffRows(
  filing: ReturnType<typeof officialFilingProductStatus>,
  submission: "not-for-etax",
  formCollations?: FormPinCollation[],
): TaxLinePinDiffRow[] {
  const scoreZero = Object.values(filing.scores).every((n) => n === 0);
  return [
    {
      id: "submission",
      label: "submission",
      diff_empty: submission === "not-for-etax",
      note: submission === "not-for-etax" ? "not-for-etax（送信なし）" : "提出経路が開いている",
    },
    {
      id: "socket",
      label: "政府ソケット",
      diff_empty: filing.socket_opens === false,
      note: filing.socket_opens ? "ソケット開放（異常）" : "非開通",
    },
    {
      id: "filing-score-tip",
      label: "filing-score (tip)",
      diff_empty: scoreZero,
      note: scoreZero ? "全0（製品ゲート・実受付なし）" : "gitignore 実受付あり",
    },
    {
      id: "statutory-filing",
      label: "statutory_filing_met",
      diff_empty: filing.statutory_filing_met === false,
      note: filing.statutory_filing_met
        ? "実受付で法定充足"
        : "未充足（ゲートが実番号を要求）",
    },
    ...buildFormPinDiffRows(formCollations),
  ];
}

export function buildTaxLinesReadModel(
  filing = officialFilingProductStatus(),
  formCollations?: FormPinCollation[],
): TaxLinesReadModel {
  const submission = "not-for-etax" as const;
  return {
    submission,
    boundary: taxModuleBoundaryNote(),
    filing,
    lines: [
      {
        id: "consumption-return",
        label: "消費税申告書（行投影）",
        status: "info",
        detail: "書き方算式・円ピン照合は CLI / acceptance。提出は not-for-etax",
      },
      {
        id: "schedule4",
        label: "別表四・別表一",
        status: "info",
        detail: "記載例ピン照合は acceptance。e-Tax 提出は別ゲート",
      },
      {
        id: "local-tax",
        label: "法人・個人の地方税行",
        status: "info",
        detail: "公式計算例ピン照合は acceptance。送信なし",
      },
      {
        id: "companies-act",
        label: "会社計算規則 表示",
        status: "blocked",
        detail: "公式円ピン不在のため法定未充足（捏造しない）",
      },
      {
        id: "filing-score",
        label: "e-Tax / eLTAX 採点",
        status: filing.statutory_filing_met ? "ok" : "blocked",
        detail: filing.statutory_filing_met
          ? "gitignore 実受付あり"
          : "受付ファイル無しのため 0（ダミー申告では埋めない）",
      },
    ],
    pin_diff_rows: buildLivePinDiffRows(filing, submission, formCollations),
  };
}
