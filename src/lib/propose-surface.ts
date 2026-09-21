/**
 * Propose-only surfaces. Path: src/lib/propose-surface.ts
 * Re-exports domain modules. No send, no transfer, no approval. ADR 0079.
 */
export { buildAuditPackIndex, renderAuditPack, type AuditSampleRef } from "./audit-pack/index.js";
export {
  assertPurchaserIsNotAcceptor,
  assertSodAllowsApply,
  dutiesFromPendingApprovals,
  findSodConflicts,
  renderSodReport,
  type SodDuty,
} from "./org/sod.js";
export { makeProposeReport, flattenProposeReport, type ProposeDepth } from "./propose/report.js";
export {
  renderProjectPlReport,
  summarizeProjectPl,
  type AllocationRule,
  type ProjectLine,
} from "./propose/project-pl.js";
export {
  dueItemsFromDeals,
  renderFollowupReport,
  scanFollowups,
  type DueItem,
} from "./propose/followup.js";
export { renderBottleneckReport, scanBottlenecks, type StuckItem } from "./propose/bottleneck.js";
export {
  loadInvoiceTextInput,
  matchRegistration,
  parseInvoiceFixture,
  proposeInvoiceJournal,
  renderInvoiceJournalReport,
  resolveInvoiceCatalog,
  type InvoiceCandidate,
} from "./propose/invoice.js";
export { extractBant, loadBantTranscriptInput, renderBantReport, type BantProposal } from "./propose/bant.js";
export {
  dispatchJobsFromLedger,
  dispatchStaffFromLedger,
  proposeDispatch,
  proposeReplan,
  renderDispatchReport,
  renderReplanReport,
  resolveDispatchInputs,
  scoreDispatch,
  type DispatchJob,
  type DispatchStaff,
} from "./propose/dispatch.js";
export {
  acceptFieldReport,
  loadFieldReportText,
  previewStockConsumption,
  proposeJobCompletion,
  renderFieldIntakeReport,
  renderFieldInterfaceReport,
  renderJobCompletionReport,
  type JobCompletionProposal,
} from "./propose/job-complete.js";
export {
  applyConsumption,
  proposeConsumption,
  proposeReorder,
  renderStockReorderReport,
} from "./propose/stock.js";
export { analyzeFieldTime, renderFieldAnalyticsReport } from "./propose/analytics.js";
export { issuePortalGrant, renderPortalGrant } from "./propose/portal.js";
export {
  issueTrackingUrl,
  loadFieldOpsJobs,
  renderTrackingStatus,
  resolveFieldOpsJob,
} from "./propose/tracking.js";
export {
  assertNoHrSecretFields,
  renderHrLifecycleReport,
  startOffboarding,
  startOnboarding,
} from "./propose/hr.js";
export {
  buildDailyCashSeries,
  renderCashflowReport,
  type CashFlow,
} from "./propose/cashflow.js";
export { renderQuoteDraftReport, renderQuotePdf, renderSalesQuotePdf } from "./propose/quote.js";
export { bridgeEventIndex, draftChainEvent, renderTraceBridgeReport } from "./propose/trace.js";
export {
  draftLostDealFollowup,
  renderLostDealFollowupReport,
  scanSilentDeals,
} from "./propose/lost-deal.js";
export {
  proposeExpenseIntake,
  renderExpenseIntakeReport,
  resolveExpenseClaimRef,
} from "./propose/expense.js";
export { proposePayrollTransfer, renderPayrollTransferReport } from "./propose/payroll.js";
export { proposeAiaCycle, renderAiaCycleReport } from "./propose/aia.js";
