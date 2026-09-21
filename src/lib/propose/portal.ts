import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../utils.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

const PORTAL_KEYS = new Set(["granteeId", "contractId", "invoiceId", "orderStatus"]);

export function issuePortalGrant(
  input: {
    granteeId: string;
    contractId?: string;
    invoiceId?: string;
    orderStatus?: string;
  } & Record<string, unknown>,
): { path: string; shows: string[]; missing_refs: string[] } {
  for (const key of Object.keys(input)) {
    if (!PORTAL_KEYS.has(key)) throw new Error(`refused field ${key}`);
  }
  const missing_refs: string[] = [];
  if (input.contractId) {
    const contractPath = join(getDataDir(), "contracts", `${input.contractId}.yaml`);
    if (!existsSync(contractPath)) missing_refs.push(`contract:${input.contractId}`);
  }
  const shows = [input.contractId, input.invoiceId, input.orderStatus].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const digest = createHash("sha256").update(input.granteeId).digest("hex").slice(0, 12);
  return { path: `/portal/${digest}`, shows, missing_refs };
}

/** One grant. Ids and status only — no document body. */
export function renderPortalGrant(
  input: {
    granteeId: string;
    contractId?: string;
    invoiceId?: string;
    orderStatus?: string;
  } & Record<string, unknown>,
): Record<string, unknown> {
  const grant = issuePortalGrant(input);
  const inputs_ref =
    input.contractId && existsSync(join(getDataDir(), "contracts", `${input.contractId}.yaml`))
      ? [`data/contracts/${input.contractId}.yaml`]
      : [];
  return flattenProposeReport(
    makeProposeReport({
      kind: "portal-grant",
      depth: inputs_ref.length > 0 ? "L2" : "L0",
      inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        path: grant.path,
        shows: grant.shows,
        missing_refs: grant.missing_refs,
        body: null,
      },
    }),
  );
}
