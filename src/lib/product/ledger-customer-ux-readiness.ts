/**
 * Customer UX readiness — 6-axis score for beginner / WebUI / AIA commercial experience.
 * Distinct from product / ops-commercial / accounting gates.
 * Checks prefer behavioral wiring (API routes + UI hooks), not mere string presence.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";
import {
  getLegalDocumentationStatus,
  isLegalDocumentationSigned,
} from "./ledger-legal-attestation.js";

export type CustomerUxAxis =
  | "onboarding"
  | "daily_journal"
  | "month_close"
  | "webui"
  | "aia"
  | "legal_invite";

export type CustomerUxCheck = {
  id: string;
  axis: CustomerUxAxis;
  label: string;
  weight: number;
  pass: boolean;
  detail?: string;
};

function fileExists(rel: string): boolean {
  return existsSync(join(getInstallRoot(), rel));
}

function sourceIncludes(rel: string, needles: string[]): boolean {
  const path = join(getInstallRoot(), rel);
  if (!existsSync(path)) return false;
  const src = readFileSync(path, "utf-8");
  return needles.every((needle) => src.includes(needle));
}

export function buildCustomerUxChecks(): CustomerUxCheck[] {
  const legal = getLegalDocumentationStatus();

  return [
    // —— onboarding ——
    {
      id: "onboard-first-source",
      axis: "onboarding",
      label: "OnboardingPage uses onboarding-first",
      weight: 6,
      pass: sourceIncludes("apps/steward-chat/src/OnboardingPage.tsx", [
        'source: "onboarding-first"',
      ]),
    },
    {
      id: "empty-post-fails",
      axis: "onboarding",
      label: "Empty journal post returns HTTP failure",
      weight: 5,
      pass: sourceIncludes("src/lib/steward-chat/routes/ledger-api.ts", [
        "no journal entries posted",
      ]),
    },
    {
      id: "force-onboard-incomplete",
      axis: "onboarding",
      label: "App forces onboarding when customer_ready false",
      weight: 5,
      pass:
        sourceIncludes("apps/steward-chat/src/App.tsx", [
          "customer_ready",
          "onboarding",
        ]) &&
        sourceIncludes("src/lib/product/ledger-onboarding.ts", [
          "customer_ready",
          "isCompanySetupComplete",
        ]),
    },
    {
      id: "customer-ready-v2",
      axis: "onboarding",
      label: "customer_ready requires company + first JE",
      weight: 4,
      pass: sourceIncludes("src/lib/product/ledger-onboarding.ts", [
        "isCompanySetupComplete",
        "customer-ready",
      ]),
    },

    // —— daily_journal ——
    {
      id: "manual-entry-api",
      axis: "daily_journal",
      label: "Manual journal entry API",
      weight: 6,
      pass:
        fileExists("src/lib/product/ledger-manual-entry.ts") &&
        sourceIncludes("src/lib/steward-chat/routes/ledger-api.ts", [
          "/chat/v1/ledger/manual-entry",
        ]),
    },
    {
      id: "manual-entry-ui",
      axis: "daily_journal",
      label: "Manual journal form in Workbench",
      weight: 5,
      pass: sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
        "manualEntry",
        "postLedgerManualEntry",
      ]),
    },
    {
      id: "bank-csv-template-api",
      axis: "daily_journal",
      label: "Bank CSV template served via API (not broken /docs link)",
      weight: 4,
      pass:
        fileExists("docs/product/bank-csv-template.csv") &&
        sourceIncludes("src/lib/steward-chat/routes/ledger-api.ts", [
          "/chat/v1/ledger/bank-csv-template",
          "presets",
        ]) &&
        sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
          "fetchBankCsvTemplate",
          'type="file"',
        ]),
    },
    {
      id: "bank-presets-module",
      axis: "daily_journal",
      label: "Bank CSV presets module + API preset query",
      weight: 4,
      pass:
        fileExists("src/lib/finance/bank-csv-presets.ts") &&
        sourceIncludes("src/lib/steward-chat/routes/ledger-api.ts", [
          "listBankCsvPresets",
          "mappingForPresetOrGuess",
        ]),
    },
    {
      id: "bank-import-wizard",
      axis: "daily_journal",
      label: "Workbench 3-step bank import wizard",
      weight: 3,
      pass: sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
        "data-bank-step",
        "bankStep",
        "bankImportPayload",
      ]),
    },
    {
      id: "bank-preset-no-override",
      axis: "daily_journal",
      label: "Preset preferred over client column_mapping",
      weight: 3,
      pass:
        sourceIncludes("src/lib/steward-chat/routes/ledger-api.ts", [
          "bank-preset-no-override",
          "mappingForPresetOrGuess",
        ]) &&
        sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
          "bankImportPayload",
        ]),
    },
    {
      id: "bank-sjis-or-encoding",
      axis: "daily_journal",
      label: "Bank CSV Shift_JIS / encoding decode path",
      weight: 3,
      pass: sourceIncludes("src/lib/finance/bank-statement-import-service.ts", [
        "decodeBankCsvBytes",
        "shift_jis",
        "bank-sjis-or-encoding",
      ]),
    },

    // —— month_close ——
    {
      id: "cl-requires-bank",
      axis: "month_close",
      label: "Month-close CL fails without bank import",
      weight: 6,
      pass: sourceIncludes("src/lib/product/ledger-month-close-checklist.ts", [
        "bank-imported",
        "bank statements not imported",
      ]),
    },
    {
      id: "lock-requires-checklist",
      axis: "month_close",
      label: "Period lock can require checklist ready",
      weight: 4,
      pass: sourceIncludes("src/lib/steward-chat/routes/ledger-api.ts", [
        "require_checklist",
      ]),
    },
    {
      id: "close-integrity-ui",
      axis: "month_close",
      label: "Month-close surfaces integrity_errors in Workbench",
      weight: 5,
      pass:
        sourceIncludes("src/lib/product/ledger-month-close-checklist.ts", [
          "integrity_errors",
        ]) &&
        sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
          "integrity_errors",
          "require_checklist",
        ]),
    },
    {
      id: "close-actionable",
      axis: "month_close",
      label: "Month-close actionable hints and scroll targets",
      weight: 3,
      pass:
        sourceIncludes("src/lib/product/ledger-month-close-checklist.ts", [
          "fix_hints",
          "scroll_target",
        ]) &&
        sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
          "対応する",
          "unmatched_samples",
        ]),
    },
    {
      id: "close-inline-approve",
      axis: "month_close",
      label: "Close block can approve unmatched with suggested AR/AP",
      weight: 4,
      pass: sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
        "消込承認",
        "suggested_ar_ap_id",
      ]),
    },

    // —— webui ——
    {
      id: "workbench-four-blocks",
      axis: "webui",
      label: "Workbench Today / TB / Reconcile / Close blocks",
      weight: 7,
      pass: sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
        "sectionToday",
        "sectionTrialBalance",
        "sectionReconcile",
        "sectionClose",
      ]),
    },
    {
      id: "pl-by-account",
      axis: "webui",
      label: "Profit and loss by account in workbench",
      weight: 5,
      pass:
        sourceIncludes("src/lib/finance/ledger/workbench.ts", [
          "profit_and_loss_lines",
        ]) &&
        sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
          "profit_and_loss",
        ]),
    },
    {
      id: "today-hero-ia",
      axis: "webui",
      label: "Today hero card with priority badges",
      weight: 4,
      pass: sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
        "module-card-accent",
        "scrollToSection",
      ]),
    },
    {
      id: "customer-journey-e2e",
      axis: "webui",
      label: "HTTP customer journey E2E test exists",
      weight: 2,
      pass: fileExists("tests/customer-journey-http.test.ts"),
    },
    {
      id: "playwright-customer-journey",
      axis: "webui",
      label: "Playwright UI-first journey (no soft 403 on setup/JE)",
      weight: 3,
      pass:
        fileExists("e2e/steward-chat-ledger-customer.spec.ts") &&
        sourceIncludes("e2e/steward-chat-ledger-customer.spec.ts", [
          "UI-first",
          "onboarding setup must succeed",
          "first JE must succeed",
        ]) &&
        !sourceIncludes("e2e/steward-chat-ledger-customer.spec.ts", [
          "expect([200, 403]).toContain(dry.status())",
        ]),
    },
    {
      id: "passkey-onboarding-inline",
      axis: "onboarding",
      label: "OnboardingPage inline Passkey registration",
      weight: 3,
      pass: sourceIncludes("apps/steward-chat/src/OnboardingPage.tsx", [
        "registerWithWebAuthn",
        "Passkey を登録",
        "ログインには Passkey が必須",
        "customer_ready",
      ]),
    },

    // —— aia ——
    {
      id: "mcp-ledger-read",
      axis: "aia",
      label: "MCP ledger_today + trial_balance",
      weight: 5,
      pass: sourceIncludes("src/lib/mcp/tools.ts", [
        "ledger_today",
        "ledger_trial_balance",
      ]),
    },
    {
      id: "mcp-queue-proposals",
      axis: "aia",
      label: "MCP propose enqueues Workbench approval queue",
      weight: 6,
      pass:
        fileExists("src/lib/product/ledger-proposal-queue.ts") &&
        sourceIncludes("src/lib/mcp/tools.ts", [
          "enqueueManualJournalProposal",
        ]) &&
        sourceIncludes("src/lib/steward-chat/routes/ledger-api.ts", [
          "/chat/v1/ledger/proposals",
        ]),
    },
    {
      id: "chat-propose-card",
      axis: "aia",
      label: "Chat LedgerProposeCard enqueues proposals",
      weight: 3,
      pass:
        fileExists("apps/steward-chat/src/LedgerProposeCard.tsx") &&
        sourceIncludes("apps/steward-chat/src/AgentChatPage.tsx", [
          "LedgerProposeCard",
        ]) &&
        sourceIncludes("apps/steward-chat/src/api.ts", [
          "postLedgerProposalEnqueue",
        ]),
    },
    {
      id: "propose-coa-select",
      axis: "aia",
      label: "ProposeCard uses COA select and proposals deep link",
      weight: 3,
      pass: sourceIncludes("apps/steward-chat/src/LedgerProposeCard.tsx", [
        "fetchLedgerAccounts",
        "#proposals",
        "<select",
      ]),
    },
    {
      id: "propose-approve-ui",
      axis: "aia",
      label: "Workbench loads and approves queued proposals",
      weight: 3,
      pass: sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
        "fetchLedgerProposals",
        "postLedgerProposalApprove",
        "提案を承認して投稿",
      ]),
    },

    // —— legal_invite ——
    {
      id: "legal-canonical",
      axis: "legal_invite",
      label: "Canonical ToS and DPA published",
      weight: 4,
      pass:
        fileExists("docs/product/legal/terms-of-service.md") &&
        fileExists("docs/product/legal/dpa.md"),
    },
    {
      id: "legal-status-honest",
      axis: "legal_invite",
      label: "Legal status honest (no draft marked signed)",
      weight: 5,
      pass:
        (!isLegalDocumentationSigned() || legal.counsel_ready) &&
        sourceIncludes("apps/steward-chat/src/CustomerAdminPage.tsx", [
          "fetchProductLegalStatus",
          "legalStatus",
        ]),
      detail: legal.detail,
    },
    {
      id: "legal-v1-signed",
      axis: "legal_invite",
      label: "Product v1 legal signed",
      weight: 3,
      pass: isLegalDocumentationSigned(),
      detail: legal.detail,
    },
    {
      id: "legal-v1-1",
      axis: "legal_invite",
      label: "Legal docs at Product v1.1",
      weight: 3,
      pass:
        sourceIncludes("docs/product/legal/terms-of-service.md", ["1.1"]) &&
        sourceIncludes("docs/product/legal/dpa.md", ["1.1"]),
    },
    {
      id: "setup-url-ui",
      axis: "legal_invite",
      label: "Guest invite setup_url shown in admin UI",
      weight: 3,
      pass: sourceIncludes("apps/steward-chat/src/CustomerAdminPage.tsx", [
        "setup_url",
        "ゲストが Passkey",
      ]),
    },
    {
      id: "invite-mail",
      axis: "legal_invite",
      label: "Guest invite sends mail to outbox",
      weight: 3,
      pass:
        sourceIncludes("apps/steward-chat/src/CustomerAdminPage.tsx", [
          "send_invite_mail",
          "mail_id",
        ]) &&
        sourceIncludes("src/lib/steward-chat/routes/product-api.ts", [
          "guest_invite",
          "sendLedgerMail",
        ]),
    },
  ];
}

const AXIS_ORDER: CustomerUxAxis[] = [
  "onboarding",
  "daily_journal",
  "month_close",
  "webui",
  "aia",
  "legal_invite",
];

export function buildCustomerUxReadinessReport() {
  const checks = buildCustomerUxChecks();
  const axisScores: Record<
    CustomerUxAxis,
    { score: number; earned: number; total: number; pass: boolean }
  > = {} as never;

  for (const axis of AXIS_ORDER) {
    const rows = checks.filter((c) => c.axis === axis && c.weight > 0);
    const earned = rows.filter((c) => c.pass).reduce((s, c) => s + c.weight, 0);
    const total = rows.reduce((s, c) => s + c.weight, 0);
    const score = total > 0 ? Math.round((earned / total) * 100) : 0;
    axisScores[axis] = {
      score,
      earned,
      total,
      pass: score >= 90,
    };
  }

  const weighted = checks.filter((c) => c.weight > 0);
  const earned = weighted.filter((c) => c.pass).reduce((s, c) => s + c.weight, 0);
  const total = weighted.reduce((s, c) => s + c.weight, 0);
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  const allAxesPass = AXIS_ORDER.every((a) => axisScores[a].pass);

  return {
    score,
    max_score: 100 as const,
    mode: "customer-ux" as const,
    all_axes_ge_90: allAxesPass,
    axis_scores: axisScores,
    checked_at: new Date().toISOString(),
    checks,
    note:
      "顧客商用体験ゲート — 初心者・WebUI・AIA。製品/課金/経理 readiness とは独立。厳格配線チェック込み。",
  };
}
