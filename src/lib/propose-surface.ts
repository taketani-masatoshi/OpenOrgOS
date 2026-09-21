/**
 * Propose-only surfaces. Path: src/lib/propose-surface.ts
 * Re-exports domain modules. No send, no transfer, no approval. ADR 0079.
 */
export { buildAuditPackIndex, type AuditSampleRef } from "./audit-pack/index.js";
export {
  assertPurchaserIsNotAcceptor,
  assertSodAllowsApply,
  findSodConflicts,
  type SodDuty,
} from "./org/sod.js";
export { summarizeProjectPl, type ProjectLine } from "./propose/project-pl.js";
export { scanFollowups, type DueItem } from "./propose/followup.js";
export { scanBottlenecks, type StuckItem } from "./propose/bottleneck.js";
export {
  matchRegistration,
  parseInvoiceFixture,
  type InvoiceCandidate,
} from "./propose/invoice.js";
export { extractBant, type BantProposal } from "./propose/bant.js";
export { proposeDispatch, proposeReplan, scoreDispatch, type DispatchJob, type DispatchStaff } from "./propose/dispatch.js";
export { acceptFieldReport, proposeJobCompletion, type JobCompletionProposal } from "./propose/job-complete.js";
export { applyConsumption, proposeConsumption, proposeReorder } from "./propose/stock.js";
export { analyzeFieldTime } from "./propose/analytics.js";
export { issuePortalGrant } from "./propose/portal.js";
export { issueTrackingUrl } from "./propose/tracking.js";
export { assertNoHrSecretFields, startOffboarding, startOnboarding } from "./propose/hr.js";
export { buildDailyCashSeries, type CashFlow } from "./propose/cashflow.js";
export { renderQuotePdf, renderSalesQuotePdf } from "./propose/quote.js";
export { bridgeEventIndex, draftChainEvent } from "./propose/trace.js";
export { draftLostDealFollowup } from "./propose/lost-deal.js";
export { proposeExpenseIntake } from "./propose/expense.js";
export { proposePayrollTransfer } from "./propose/payroll.js";
export { proposeAiaCycle } from "./propose/aia.js";
export { proposeInvoiceJournal } from "./propose/invoice.js";
