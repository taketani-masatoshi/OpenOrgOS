import type { IntegrityIssue } from "../integrity.js";
import {
  loadCustomerAccounts,
  loadCustomerChurnEvents,
  loadCustomerHealthSignals,
  loadCustomerNps,
  loadCustomerOnboarding,
  loadCustomerQbr,
} from "../data.js";
import { isModuleEnabled } from "../module-business-data.js";
import {
  computeAccountHealth,
  latestByAccountId,
  onboardingByAccountId,
} from "./health-score.js";
import { loadHealthRubric } from "./health-rubric.js";
import { currentDate } from "../utils.js";

const CS_MODULE_ID = "customer_success";
const CS_DIR = "data/customers";

function pushIssue(
  issues: IntegrityIssue[],
  level: IntegrityIssue["level"],
  file: string,
  message: string,
): void {
  issues.push({ level, file, message });
}

export function collectCustomerSuccessIntegrityIssues(): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const accountsFile = loadCustomerAccounts();
  if (!accountsFile) return issues;

  const accountIds = new Set(accountsFile.accounts.map((a) => a.id));
  const checkRef = (file: string, accountId: string, label: string) => {
    if (!accountIds.has(accountId)) {
      pushIssue(
        issues,
        "error",
        file,
        `${label}: unknown account_id ${accountId}`,
      );
    }
  };

  const signals = loadCustomerHealthSignals();
  if (signals) {
    const ids = new Set<string>();
    for (const s of signals.signals) {
      checkRef(`${CS_DIR}/health-signals.yaml`, s.account_id, s.id);
      if (ids.has(s.id)) {
        pushIssue(issues, "error", `${CS_DIR}/health-signals.yaml`, `duplicate signal id ${s.id}`);
      }
      ids.add(s.id);
    }
  }

  const onboarding = loadCustomerOnboarding();
  if (onboarding) {
    const ids = new Set<string>();
    for (const o of onboarding.onboardings) {
      checkRef(`${CS_DIR}/onboarding.yaml`, o.account_id, o.id);
      if (ids.has(o.id)) {
        pushIssue(issues, "error", `${CS_DIR}/onboarding.yaml`, `duplicate onboarding id ${o.id}`);
      }
      ids.add(o.id);
    }
  }

  const qbr = loadCustomerQbr();
  if (qbr) {
    const ids = new Set<string>();
    for (const q of qbr.qbrs) {
      checkRef(`${CS_DIR}/qbr.yaml`, q.account_id, q.id);
      if (ids.has(q.id)) {
        pushIssue(issues, "error", `${CS_DIR}/qbr.yaml`, `duplicate qbr id ${q.id}`);
      }
      ids.add(q.id);
    }
  }

  const nps = loadCustomerNps();
  if (nps) {
    const ids = new Set<string>();
    for (const r of nps.responses) {
      checkRef(`${CS_DIR}/nps.yaml`, r.account_id, r.id);
      if (ids.has(r.id)) {
        pushIssue(issues, "error", `${CS_DIR}/nps.yaml`, `duplicate nps id ${r.id}`);
      }
      ids.add(r.id);
    }
  }

  const churn = loadCustomerChurnEvents();
  if (churn) {
    const ids = new Set<string>();
    for (const e of churn.events) {
      checkRef(`${CS_DIR}/churn-events.yaml`, e.account_id, e.id);
      if (ids.has(e.id)) {
        pushIssue(
          issues,
          "error",
          `${CS_DIR}/churn-events.yaml`,
          `duplicate churn event id ${e.id} — churn-events is append-only`,
        );
      }
      ids.add(e.id);
    }
  }

  try {
    const rubric = loadHealthRubric();
    const asOf = currentDate();
    const signalMap = latestByAccountId(signals?.signals ?? [], "observed_on");
    const npsMap = latestByAccountId(nps?.responses ?? [], "surveyed_on");
    const onboardingMap = onboardingByAccountId(onboarding?.onboardings ?? []);

    for (const account of accountsFile.accounts) {
      if (account.health === "churned") continue;
      const result = computeAccountHealth(
        {
          account,
          asOf,
          latestSignal: signalMap.get(account.id),
          latestNps: npsMap.get(account.id),
          onboarding: onboardingMap.get(account.id),
        },
        rubric,
      );
      if (result.drift) {
        pushIssue(
          issues,
          "warning",
          `${CS_DIR}/accounts.yaml`,
          `${account.id}: declared health=${account.health} but computed recommended=${result.recommended} (score=${result.score})`,
        );
      }
    }
  } catch {
    /* rubric missing — module not fully installed */
  }

  if (isModuleEnabled(CS_MODULE_ID)) {
    if (!signals && !onboarding && !nps) {
      pushIssue(
        issues,
        "warning",
        CS_DIR,
        "customer_success module enabled but no health-signals/onboarding/nps YAML found — run orgos modules activate customer_success",
      );
    }
  }

  return issues;
}
