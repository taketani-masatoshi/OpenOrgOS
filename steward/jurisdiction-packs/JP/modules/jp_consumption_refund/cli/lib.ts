import type {
  ConsumptionTaxClaimKind,
  ConsumptionTaxSummary,
} from "../../../../../../schemas/finance/consumption-tax.js";
import {
  assessConsumptionRefundEligibility,
  eligibilityForKind,
} from "../../../../../../src/lib/finance/consumption-tax-eligibility.js";
import { assertClaimStatusAdvance } from "../../../../../../src/lib/finance/consumption-tax-refund-receipt.js";
import {
  isModuleEnabled,
  loadModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import {
  consumptionRefundClaimsFileSchema,
  type ConsumptionRefundClaim,
  type ConsumptionRefundClaimStatus,
  type ConsumptionRefundClaimsFile,
} from "./schema.js";

export const MODULE_ID = "jp_consumption_refund";
export const CLAIMS_FILE = "consumption-refund-claims.yaml";
export const OPEN_CLAIM_STATUSES = new Set([
  "draft",
  "advisor_review",
  "ready_to_file",
]);

export function claimIdFor(period: string, kind: ConsumptionTaxClaimKind): string {
  return `CLAIM-${period}-${kind}`;
}

export function requireRefundModuleEnabled(): void {
  if (!isModuleEnabled(MODULE_ID)) {
    throw new Error(`module not enabled: ${MODULE_ID}`);
  }
}

export function loadClaimsFile(): ConsumptionRefundClaimsFile {
  const loaded = loadModuleDataFile(MODULE_ID, CLAIMS_FILE, consumptionRefundClaimsFileSchema);
  if (!loaded) {
    return { entity: "unknown", claims: [] };
  }
  return loaded.data;
}

export function loadLiveClaimsFile(): ConsumptionRefundClaimsFile | null {
  return (
    loadModuleDataFile(MODULE_ID, CLAIMS_FILE, consumptionRefundClaimsFileSchema, {
      source: "tenant-live",
    })?.data ?? null
  );
}

export function replaceClaim(
  file: ConsumptionRefundClaimsFile,
  claim: ConsumptionRefundClaim,
): ConsumptionRefundClaimsFile {
  return {
    ...file,
    claims: [...file.claims.filter((row) => row.id !== claim.id), claim],
  };
}

export function applyClaimStatus(
  claim: ConsumptionRefundClaim,
  to: ConsumptionRefundClaimStatus,
  extra: Partial<ConsumptionRefundClaim> = {},
): ConsumptionRefundClaim {
  assertClaimStatusAdvance(claim.status, to);
  if (extra.amount_yen != null && extra.amount_yen !== claim.amount_yen) {
    throw new Error(`${claim.id}: amount_yen is immutable`);
  }
  return {
    ...claim,
    ...extra,
    id: claim.id,
    kind: claim.kind,
    period: claim.period,
    assessment_period: claim.assessment_period,
    amount_yen: claim.amount_yen,
    status: to,
  };
}

export function findOpenClaim(
  file: ConsumptionRefundClaimsFile,
  period: string,
): ConsumptionRefundClaim | undefined {
  return file.claims.find(
    (claim) => claim.period === period && OPEN_CLAIM_STATUSES.has(claim.status),
  );
}

/** Assessment から CLAIM を組み立てる。金額は invent しない。 */
export function proposeClaimFromAssessment(input: {
  summary: ConsumptionTaxSummary;
  kind: ConsumptionTaxClaimKind;
  exceptionBasis?: string;
}): ConsumptionRefundClaim {
  const eligibility = assessConsumptionRefundEligibility({
    summary: input.summary,
    exceptionBasis: input.exceptionBasis,
  });
  const line = eligibilityForKind(eligibility, input.kind);
  const simplifiedException =
    input.kind === "simplified" && Boolean(input.exceptionBasis?.trim());
  if (line.gate === "blocked" && !simplifiedException) {
    throw new Error(`claim gated: ${input.kind} (${line.reason})`);
  }
  return {
    id: claimIdFor(input.summary.period, input.kind),
    kind: input.kind,
    period: input.summary.period,
    assessment_period: input.summary.period,
    amount_yen: input.summary.refund_candidate_yen,
    status: "draft",
    gate: simplifiedException ? "blocked" : line.gate,
    gate_reason: simplifiedException
      ? "simplified_exception_requires_advisor_claim"
      : line.reason,
    exception_basis: input.exceptionBasis?.trim() || undefined,
    evidence_paths: [],
  };
}

export function validateClaims(file: ConsumptionRefundClaimsFile): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  const openByPeriod = new Map<string, string[]>();

  for (const claim of file.claims) {
    if (seen.has(claim.id)) issues.push(`${claim.id}: duplicate id`);
    seen.add(claim.id);
    if (
      claim.kind === "simplified" &&
      claim.status !== "blocked" &&
      !claim.exception_basis?.trim()
    ) {
      issues.push(`${claim.id}: simplified requires exception_basis`);
    }
    if (claim.status === "filed_by_human" && !claim.filed_on) {
      issues.push(`${claim.id}: filed_by_human requires filed_on`);
    }
    if (claim.status === "received" && !claim.received_on) {
      issues.push(`${claim.id}: received requires received_on`);
    }
    if (claim.status === "received" && !claim.journal_entry_id) {
      issues.push(`${claim.id}: received requires journal_entry_id`);
    }
    if (OPEN_CLAIM_STATUSES.has(claim.status)) {
      const ids = openByPeriod.get(claim.period) ?? [];
      ids.push(claim.id);
      openByPeriod.set(claim.period, ids);
    }
  }

  for (const [period, ids] of openByPeriod) {
    if (ids.length > 1) {
      issues.push(`${period}: multiple open claims (${ids.join(", ")})`);
    }
  }
  return issues;
}

export function assertPackable(claim: ConsumptionRefundClaim): void {
  if (claim.kind === "export" && claim.evidence_paths.length === 0) {
    throw new Error(`${claim.id}: export pack requires evidence_paths`);
  }
}

export function formatClaimsShowMarkdown(file: ConsumptionRefundClaimsFile): string {
  if (!file.claims.length) {
    return [
      "# 消費税還付クレーム",
      "",
      "クレームなし。",
      "",
      "次: `orgos operations consumption-refund eligibility --period YYYY-MM`",
    ].join("\n");
  }
  return [
    "# 消費税還付クレーム",
    "",
    `件数: ${file.claims.length}`,
    "",
    ...file.claims.map(
      (claim) =>
        `- ${claim.id} · ${claim.kind} · ${claim.status} · ${claim.amount_yen.toLocaleString()} JPY · ${claim.gate} (${claim.gate_reason})`,
    ),
    "",
    "提出は人間。e-Tax は実行しない。",
  ].join("\n");
}

export function formatRefundPackMarkdown(claim: ConsumptionRefundClaim): string {
  return [
    `# 消費税還付パック ${claim.id}`,
    "",
    `- 種別: ${claim.kind}`,
    `- 期間: ${claim.period}`,
    `- 金額（Assessment コピー）: ${claim.amount_yen.toLocaleString()} JPY`,
    `- 状態: ${claim.status}`,
    `- ゲート: ${claim.gate} (${claim.gate_reason})`,
    claim.exception_basis ? `- 例外根拠: ${claim.exception_basis}` : "",
    claim.refund_bank_account_id
      ? `- 還付口座: ${claim.refund_bank_account_id}`
      : "- 還付口座: bank_account_id 未設定",
    "",
    "## 次（人間 / 税理士）",
    "- 区分と金額の確定",
    "- 申告書作成 · 電子署名",
    "- 提出後 `orgos operations consumption-refund file --id ...`（人間）",
    "- 入金後 `orgos operations consumption-refund receive --id ...`（人間 · 仕訳）",
    "",
    "OrgOS は e-Tax を実行しません。",
  ]
    .filter(Boolean)
    .join("\n");
}
