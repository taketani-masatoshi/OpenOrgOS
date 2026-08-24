/**
 * Known direct canonical writes not yet routed through wrapCanonicalWrite / guarded writers.
 * New hits fail scripts/check-canonical-writes.ts — migrate or add here with justification.
 * Generated/updated by: node --import tsx scripts/check-canonical-writes.ts --write
 */
export type CanonicalWriteBaselineEntry = {
  file: string;
  symbol: string;
  count: number;
  note: string;
};

export const CANONICAL_WRITE_BASELINE: CanonicalWriteBaselineEntry[] = [
  { file: "src/commands/finances-close.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/commands/locale-jurisdiction.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/commands/migrate.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/commands/operator-registry.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/commands/operator.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/commands/platform-scaffold.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/commands/protocol.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/commands/wire-gateway.ts", symbol: "copyFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/commands/workspace.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/agent-capability-sync.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/agent-docs-sync.ts", symbol: "writeFileSync", count: 3, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/agent-portability.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/agent-workspace.ts", symbol: "cpSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/agent-workspace.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/aia/scheduler.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/broker.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/certification-workflow.ts", symbol: "copyFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/company-events-chain.ts", symbol: "copyFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/company-events-export.ts", symbol: "cpSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/company-events-export.ts", symbol: "writeFileSync", count: 7, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/company-events-signing.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/console-auth/session-store.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/context-manifest.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/correspondence/gmail-oauth.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/correspondence/gmail-receive-sync.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/correspondence/mail-config.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/correspondence/mail-receive-sync.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/correspondence/mail-send.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/document-io.ts", symbol: "copyFileSync", count: 4, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/document-io.ts", symbol: "renameSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/finance/tax-filing-docs.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/folder-housekeeping.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/hub/federation.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/hub/merkle-anchor.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/hub/signing.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/inspection-workflow.ts", symbol: "copyFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/integrations.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/invoice-email.ts", symbol: "writeFileSync", count: 3, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/jsonl-store.ts", symbol: "appendFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/jsonl-store.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/latex-compile.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/mcp/audit.ts", symbol: "appendFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/module-compliance-onboard.ts", symbol: "copyFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/module-compliance-onboard.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/operator-commands/execute.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/operator-policy.ts", symbol: "writeFileSync", count: 7, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/operator-runtime/telemetry.ts", symbol: "appendFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/org/budget-delegation.ts", symbol: "copyFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/org/human-approval-context.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/org/instruction-audit.ts", symbol: "appendFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/org/operator-keys.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/org/settlement-stepup.ts", symbol: "renameSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/org/settlement-stepup.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/pdf-esign/adapters/digidoc.ts", symbol: "copyFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/pdf-esign/digidoc-sidecar-client.ts", symbol: "renameSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/pdf-esign/digidoc-sidecar-client.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/audit-chain.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/community-export.ts", symbol: "copyFileSync", count: 3, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/community-export.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/community-gmail-bind.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/dev-server-tls.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/email-wire-deliver.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/org-cert-witness.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/outbox-provenance.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/protocol-api-server.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/signing.ts", symbol: "writeFileSync", count: 3, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/test-suite-status.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/tls-pki.ts", symbol: "writeFileSync", count: 4, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/transport.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/transport/inbound.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/trusted-hubs-sync.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/wire-live-verify.ts", symbol: "copyFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/wire-live-verify.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/wire-trust-registry-sync.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/witness-attestation-build.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/protocol/witness-trust.ts", symbol: "writeFileSync", count: 4, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/receipt-qr.ts", symbol: "renameSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/receipt-qr.ts", symbol: "writeFileSync", count: 5, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/regulations.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/scheduling-coordination/inject-schedule-reply-mail.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/scheduling-coordination/rehearsal-mail-overlay.ts", symbol: "writeFileSync", count: 4, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/steward-chat/audit.ts", symbol: "appendFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/steward-chat/chat-thread.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/sync-csv.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/tenant-document-zones.ts", symbol: "writeFileSync", count: 3, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/tenant-init.ts", symbol: "cpSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/tenant-init.ts", symbol: "writeFileSync", count: 3, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/tenant-scaffold.ts", symbol: "cpSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/tenant-scaffold.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/tenant-setup-wizard.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/vault.ts", symbol: "copyFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire-console/auth/passkey-bootstrap.ts", symbol: "renameSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire-console/auth/passkey-bootstrap.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire-console/auth/passkey-field-check-record.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire-console/auth/webauthn-challenge-store.ts", symbol: "renameSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire-console/auth/webauthn-challenge-store.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire-console/auth/webauthn-env-sign-count.ts", symbol: "renameSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire-console/auth/webauthn-env-sign-count.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire-console/auth/webauthn-store.ts", symbol: "renameSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire-console/auth/webauthn-store.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire-console/process.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire-gateway/nonce-ledger.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "src/lib/wire/gov-gateway/sandbox.ts", symbol: "copyFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "steward/jurisdiction-packs/JP/modules/jp_corporate_registration/cli/lib.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "steward/jurisdiction-packs/JP/modules/jp_permit_application/cli/application-lib.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "steward/jurisdiction-packs/JP/modules/jp_permit_registry/cli/application-lib.ts", symbol: "writeFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "steward/modules/hospitality/cli/guest-register.ts", symbol: "appendFileSync", count: 2, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "steward/modules/language_bridge/cli/commands.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
  { file: "steward/modules/travel_booking/cli/lib.ts", symbol: "writeFileSync", count: 1, note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile" },
];

export function canonicalWriteBaselineKey(entry: Pick<CanonicalWriteBaselineEntry, "file" | "symbol">): string {
  return `${entry.file}:${entry.symbol}`;
}

export function countCanonicalWriteBaselineEntries(): number {
  return CANONICAL_WRITE_BASELINE.reduce((sum, entry) => sum + entry.count, 0);
}

/** Files that implement or bootstrap the guard — not tenant canonical writes. */
export const CANONICAL_WRITE_SCAN_SKIP_FILES = new Set([
  "src/lib/utils.ts",
  "src/lib/yaml-atomic.ts",
  "src/lib/org/fs-guard/guarded-write.ts",
  "src/lib/org/fs-guard/lease.ts",
  "src/lib/org/fs-guard/store.ts",
  "src/lib/org/fs-guard/policy.ts",
  "src/lib/org/fs-guard/write-hook.ts",
  "src/lib/org/fs-guard/canonical-write-baseline.ts",
  "src/lib/operator-runtime/shell.ts",
  "scripts/check-canonical-writes.ts",
]);

export const CANONICAL_WRITE_SCAN_SKIP_DIRS = new Set([
  "node_modules",
  "tests",
  "dist",
  "apps/steward-chat/dist",
  "apps/wire-console/dist",
]);

export const CANONICAL_WRITE_SYMBOLS = [
  "writeFileSync",
  "appendFileSync",
  "copyFileSync",
  "cpSync",
  "renameSync",
] as const;
