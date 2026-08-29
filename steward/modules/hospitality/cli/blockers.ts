import { listPermitOpeningBlockers } from "../../../../src/lib/permit-opening-gate.js";
import { listP0Items } from "../../../../src/lib/p0-status.js";
import { getP0Secrets } from "../../../../src/lib/ops-config.js";
import { validateGuestRegister } from "./guest-register.js";
import { listHospitalityOpsDue } from "./ops-due.js";

export type HospitalityBlocker = {
  severity: "p0" | "p1";
  source: "permit" | "registration" | "p0" | "ops" | "register";
  title: string;
  detail: string;
  cli_hint: string;
};

function mapGateSource(
  fulfilment?: "license" | "certification" | "inspection" | "registration"
): HospitalityBlocker["source"] {
  return fulfilment === "registration" ? "registration" : "permit";
}

function mapGateSeverity(
  fulfilment?: "license" | "certification" | "inspection" | "registration"
): HospitalityBlocker["severity"] {
  return fulfilment === "registration" ? "p1" : "p0";
}

export function listHospitalityBlockers(): HospitalityBlocker[] {
  const items: HospitalityBlocker[] = [];

  for (const b of listPermitOpeningBlockers({ moduleId: "hospitality" })) {
    items.push({
      severity: mapGateSeverity(b.fulfilment),
      source: mapGateSource(b.fulfilment),
      title: b.title,
      detail: b.detail,
      cli_hint: "orgos operations permit-app opening-blockers --module hospitality",
    });
  }

  const hospP0Ids = new Set(
    getP0Secrets()
      .filter((s) => s.module_id === "hospitality")
      .map((s) => s.item_id ?? `secrets-${s.module_id}`)
  );
  hospP0Ids.add("CTR-012");

  for (const p0 of listP0Items().filter((i) => i.blocker && i.status !== "done")) {
    if (!hospP0Ids.has(p0.id)) continue;
    items.push({
      severity: "p0",
      source: "p0",
      title: p0.label,
      detail: p0.detail ?? p0.status,
      cli_hint: "orgos ops p0",
    });
  }

  for (const due of listHospitalityOpsDue().filter((d) => d.severity === "p0")) {
    items.push({
      severity: "p0",
      source: "ops",
      title: due.title,
      detail: `期限 ${due.due_on}`,
      cli_hint: due.cli_hint,
    });
  }

  const register = validateGuestRegister();
  if (register.issues.some((i) => i.level === "error")) {
    items.push({
      severity: "p0",
      source: "register",
      title: "宿泊者名簿 validate error",
      detail: `${register.issues.filter((i) => i.level === "error").length} 件`,
      cli_hint: "operations hospitality register-validate",
    });
  }

  const rank = { p0: 0, p1: 1 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
