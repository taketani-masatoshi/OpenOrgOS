import { createHash } from "node:crypto";

const PORTAL_KEYS = new Set(["granteeId", "contractId", "invoiceId", "orderStatus"]);

export function issuePortalGrant(
  input: {
    granteeId: string;
    contractId?: string;
    invoiceId?: string;
    orderStatus?: string;
  } & Record<string, unknown>,
): { path: string; shows: string[] } {
  for (const key of Object.keys(input)) {
    if (!PORTAL_KEYS.has(key)) throw new Error(`refused field ${key}`);
  }
  const shows = [input.contractId, input.invoiceId, input.orderStatus].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const digest = createHash("sha256").update(input.granteeId).digest("hex").slice(0, 12);
  return { path: `/portal/${digest}`, shows };
}
