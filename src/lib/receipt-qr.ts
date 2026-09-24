/**
 * JP QR receipts (適格請求書 / 適格簡易請求書) — public entry point.
 * Path: src/lib/receipt-qr.ts · modules: src/lib/receipt-qr/
 */
export {
  resolveReceiptIssuerIdentity,
  type ReceiptIssuerIdentity,
} from "./receipt-qr/issuer-identity.js";
export { decodeReceiptLink, encodeReceiptLink } from "./receipt-qr/link-codec.js";
export {
  receiptDigest,
  signReceiptForTests,
  signReceiptWithKey,
  verifySignedReceiptPayload,
} from "./receipt-qr/signature.js";
export { receiptRegistryPath, receiptSnapshotDir } from "./receipt-qr/paths.js";
export {
  defaultReceiptQrConfig,
  initReceiptQrConfig,
  loadReceiptConfigOrDefault,
  loadReceiptQrConfig,
  receiptPortalUrl,
  type ReceiptQrConfigInitInput,
} from "./receipt-qr/config.js";
export {
  loadIssuedReceiptPayload,
  loadReceiptSnapshot,
  loadSignedReceiptForPdf,
  saveIssuedReceiptPayload,
  saveVerifiedReceiptSnapshot,
} from "./receipt-qr/payload-store.js";
export {
  findStoredReceipt,
  loadReceiptRegistry,
  validateReceiptRegistryIntegrity,
  type ReceiptRegistryIntegrityIssue,
} from "./receipt-qr/registry.js";
export {
  issueReceipt,
  parseReceiptIssueInputFile,
  type ReceiptIssueInput,
} from "./receipt-qr/issue.js";
export {
  approveReceiptClaim,
  claimReceipt,
  rejectReceiptClaim,
} from "./receipt-qr/claim.js";
export {
  claimReceiptRemotely,
  fetchSignedReceiptOnline,
  ingestReceiptQrPayload,
} from "./receipt-qr/claimant.js";
export {
  forbiddenAmountFieldInReceiptClaimPayload,
  handleReceiptClaimApi,
} from "./receipt-qr/wire-inbound.js";
