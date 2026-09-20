import { etaxError } from "../../../schemas/etax/errors.js";

/** Official / production receipt numbers must never use the mock label. */
export function assertOfficialReceiptNumberNotMock(receiptNumber: string | undefined): void {
  if (receiptNumber?.startsWith("MOCK-NOT-NTA-")) {
    throw etaxError({
      code: "ETAX_OFFICIAL_RECEIPT_MOCK_PREFIX",
      blocked: "SPEC_BLOCKED",
      message: "Official receipt path must not return MOCK-NOT-NTA- prefixed numbers",
    });
  }
}

export function officialReceiptRefusesMockPrefix(receiptNumber: string): boolean {
  try {
    assertOfficialReceiptNumberNotMock(receiptNumber);
    return false;
  } catch {
    return true;
  }
}
