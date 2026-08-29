/**
 * Close / propose gate predicates (entry-based — no ledger-ops import).
 */
export class MedicalDeviceGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MedicalDeviceGateError";
  }
}

/** CAPA close requires quality fields + effectiveness when scheduled. */
export function assertCapaEntryCloseable(
  entry: Record<string, unknown>,
  opts?: { force?: boolean }
): void {
  const id = String(entry.id ?? "?");
  const root = String(entry.root_cause ?? "").trim();
  const action = String(entry.action ?? "").trim();
  if ((!root || !action) && !opts?.force) {
    throw new MedicalDeviceGateError(
      `CAPA ${id}: root_cause と action が必須（または --force）`
    );
  }
  if (!entry.effectiveness_check_on) return;
  const result = String(entry.effectiveness_result ?? "");
  if (result === "effective") return;
  if (opts?.force) return;
  throw new MedicalDeviceGateError(
    `CAPA ${id}: 有効性未確認 (result=${result || "none"}). ` +
      `capa record-effectiveness --result effective または --force`
  );
}

export function assertInquiryEntryCloseable(
  entry: Record<string, unknown>,
  opts?: { force?: boolean }
): void {
  const id = String(entry.id ?? "?");
  const path = String(entry.response_draft_path ?? "").trim();
  if (!path && !opts?.force) {
    throw new MedicalDeviceGateError(
      `照会 ${id}: response_draft_path が必須（inquiry set-response または --force）`
    );
  }
}

export function assertChangeEntryImplementable(
  entry: Record<string, unknown>,
  opts?: { force?: boolean }
): void {
  const id = String(entry.id ?? "?");
  const risk = String(entry.risk_review ?? "").trim();
  if (!risk && !opts?.force) {
    throw new MedicalDeviceGateError(
      `変更 ${id}: risk_review が必須（または --force）`
    );
  }
}
