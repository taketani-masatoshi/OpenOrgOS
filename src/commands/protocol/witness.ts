/** Witness pool, trust, and trusted-hubs command handlers. */
import { loadTenantConfig } from "../../lib/tenant.js";
import { applyProtocolTenant } from "./shared.js";
import {
  findTrustedHubsForJurisdiction,
  validateTrustedHubsRegistry,
} from "../../lib/protocol/distribution/trusted-hubs.js";
import {
  initWitnessTrustAuthority,
  publishWitnessTrustBundle,
} from "../../lib/protocol/distribution/witness-trust.js";
import { getWitnessTrustBundlePath } from "../../lib/protocol/core/paths.js";
import { revokeWitnessHubCertificate } from "../../lib/protocol/distribution/witness-trust.js";


export interface ProtocolWitnessCacheMissingOptions {
  tenant?: string;
  peer?: string;
  since?: string;
  json?: boolean;
}

export async function runProtocolWitnessCacheMissing(
  opts: ProtocolWitnessCacheMissingOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { cacheMissingWitnessReceipts } = await import("../../lib/protocol/distribution/transaction-orphans.js");
  const result = await cacheMissingWitnessReceipts({
    peerId: opts.peer,
    since: opts.since,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `witness cache-missing: ${result.checked} outbound without cache · fetched ${result.fetched} event(s)`
  );
  if (result.still_missing.length) {
    console.log(`  still missing (${result.still_missing.length}):`);
    for (const eventId of result.still_missing) console.log(`    · ${eventId}`);
  } else if (result.checked === 0) {
    console.log("  (all outbound transactions already cached or none registered)");
  } else {
    console.log("✓ witness receipts cached for all checked events");
  }
}

export interface ProtocolWitnessRegisterOptions {
  eventId: string;
  side: "sent" | "received";
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessRegister(opts: ProtocolWitnessRegisterOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { findEnvelopeFileForWitness } = await import("../../lib/protocol/distribution/witness-client.js");
  const { registerWitnessAttestationFanOut } = await import("../../lib/protocol/distribution/witness-client.js");
  const envelope = findEnvelopeFileForWitness(opts.eventId);
  if (!envelope) {
    console.error(`Envelope not found for event_id ${opts.eventId}`);
    process.exit(1);
  }
  const result = await registerWitnessAttestationFanOut({ envelope, side: opts.side });
  if (!result) {
    console.error("Witness pool disabled or empty");
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`witness fan-out: ${result.succeeded.length}/${result.succeeded.length + result.failed.length} hubs`);
  console.log(`quorum: ${result.quorum.satisfied ? "satisfied" : "NOT satisfied"} (${result.quorum.matched}/${result.quorum.required})`);
}

export interface ProtocolWitnessFlushPendingOptions {
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessFlushPending(opts: ProtocolWitnessFlushPendingOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { flushWitnessPending } = await import("../../lib/protocol/distribution/witness-client.js");
  const flushed = await flushWitnessPending();
  if (opts.json) {
    console.log(JSON.stringify({ flushed }, null, 2));
    return;
  }
  console.log(`✓ flushed ${flushed} pending witness attestation(s)`);
}

export interface ProtocolWitnessVerifyOptions {
  eventId: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessVerify(opts: ProtocolWitnessVerifyOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { verifyCachedReceiptsForEvent, fetchReceiptsFromPool } = await import("../../lib/protocol/distribution/witness-client.js");
  await fetchReceiptsFromPool(opts.eventId);
  const result = verifyCachedReceiptsForEvent(opts.eventId);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`receipts: ${result.receipts.length} · quorum: ${result.quorum.satisfied ? "ok" : "FAIL"}`);
  for (const issue of result.issues) console.log(`  ! ${issue}`);
  if (!result.quorum.satisfied) process.exit(1);
}

export interface ProtocolWitnessPoolStatusOptions {
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessPoolStatus(opts: ProtocolWitnessPoolStatusOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { loadWitnessPoolConfig } = await import("../../lib/protocol/distribution/witness-pool.js");
  const { checkWitnessPoolHealth } = await import("../../lib/protocol/distribution/witness-client.js");
  const pool = loadWitnessPoolConfig();
  const health = await checkWitnessPoolHealth(pool);
  if (opts.json) {
    console.log(JSON.stringify({ pool, health }, null, 2));
    return;
  }
  console.log(`witness pool: enabled=${pool.enabled} · quorum=${pool.quorum.mode} · hubs=${pool.hubs.length}`);
  for (const h of health) {
    console.log(`  · ${h.hub_id}: ${h.ok ? "ok" : "DOWN"} (${h.url})`);
  }
}

export interface ProtocolWitnessReconcileOptions {
  peer: string;
  since?: string;
  eventId?: string;
  crossHub?: boolean;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessReconcile(
  opts: ProtocolWitnessReconcileOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { reconcileWitnessWithPeerAndPersist, reconcileCrossHub } = await import("../../lib/protocol/distribution/witness-reconcile.js"
  );
  const { persistAndEscalateAlerts } = await import("../../lib/protocol/distribution/reconcile-alerts-store.js");

  if (opts.crossHub) {
    const cross = await reconcileCrossHub({ since: opts.since, eventId: opts.eventId });
    const peer = await reconcileWitnessWithPeerAndPersist({
      peerId: opts.peer,
      since: opts.since,
      eventId: opts.eventId,
      remoteLedger: true,
    });
    persistAndEscalateAlerts(cross.alerts);
    const result = { peer, cross_hub: cross };
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`reconcile peer ${peer.peer_id}: checked ${peer.checked} · cross-hub ${cross.checked}`);
    for (const alert of [...peer.alerts, ...cross.alerts]) {
      console.log(`  [${alert.severity}] ${alert.code}: ${alert.message}`);
    }
    const hasErrors = [...peer.alerts, ...cross.alerts].some((a) => a.severity === "error");
    if (hasErrors) process.exit(1);
    return;
  }

  const result = await reconcileWitnessWithPeerAndPersist({
    peerId: opts.peer,
    since: opts.since,
    eventId: opts.eventId,
    remoteLedger: true,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`reconcile peer ${result.peer_id}: checked ${result.checked} outbound tx(s)`);
  console.log(`  quorum ok: ${result.quorum_ok} · fail: ${result.quorum_fail}`);
  for (const alert of result.alerts) {
    console.log(`  [${alert.severity}] ${alert.code}: ${alert.message}`);
  }
  const hasErrors = result.alerts.some((a) => a.severity === "error");
  if (hasErrors) process.exit(1);
}

export interface ProtocolTrustedHubsListOptions {
  jurisdiction?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolTrustedHubsList(opts: ProtocolTrustedHubsListOptions): void {
  applyProtocolTenant(opts.tenant);
  const jurisdiction = opts.jurisdiction ?? loadTenantConfig().jurisdiction ?? "JP";
  const entry = findTrustedHubsForJurisdiction(jurisdiction);
  if (opts.json) {
    console.log(JSON.stringify(entry ?? { jurisdiction, hubs: [] }, null, 2));
    return;
  }
  console.log(`trusted hubs (${jurisdiction}): ${entry?.hubs.length ?? 0}`);
  for (const h of entry?.hubs ?? []) {
    console.log(`  · ${h.hub_id}: ${h.hub_url}`);
  }
}

export interface ProtocolTrustedHubsValidateOptions {
  tenant?: string;
  json?: boolean;
}

export function runProtocolTrustedHubsValidate(opts: ProtocolTrustedHubsValidateOptions): void {
  applyProtocolTenant(opts.tenant);
  const result = validateTrustedHubsRegistry();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    console.log("✓ Trusted hubs registry OK");
    for (const w of result.warnings) {
      console.log(`  [warn] ${w.code}: ${w.message}`);
    }
    return;
  }
  console.error("✗ Trusted hubs validation failed:");
  for (const issue of result.issues) {
    console.error(`  [${issue.code}] ${issue.message}`);
  }
  process.exit(1);
}

export interface ProtocolWitnessPoolInitTrustedOptions {
  jurisdiction?: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessPoolInitTrusted(
  opts: ProtocolWitnessPoolInitTrustedOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const jurisdiction = opts.jurisdiction ?? loadTenantConfig().jurisdiction ?? "JP";
  const { initWitnessPoolFromTrusted } = await import("../../lib/protocol/distribution/witness-pool-init.js");
  const result = await initWitnessPoolFromTrusted(jurisdiction);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ witness-pool.yaml initialized from trusted hubs (${jurisdiction})`);
  console.log(`  path: ${result.path} · hubs: ${result.hubs.length}`);
}

export interface ProtocolWitnessTrustInitAuthorityOptions {
  authorityId: string;
  orgName: string;
  jurisdiction?: string;
  orgUri?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolWitnessTrustInitAuthority(
  opts: ProtocolWitnessTrustInitAuthorityOptions
): void {
  applyProtocolTenant(opts.tenant);
  const jurisdiction = opts.jurisdiction ?? loadTenantConfig().jurisdiction ?? "JP";
  const authority = initWitnessTrustAuthority({
    authorityId: opts.authorityId,
    orgName: opts.orgName,
    jurisdiction,
    orgUri: opts.orgUri,
  });
  if (opts.json) {
    console.log(JSON.stringify(authority, null, 2));
    return;
  }
  console.log(`✓ witness trust authority ${authority.authority_id} · ${authority.org_name}`);
}

export interface ProtocolWitnessTrustCertifyOptions {
  hubId: string;
  hubUrl: string;
  hubPublicKey?: string;
  expiresAt?: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessTrustCertify(
  opts: ProtocolWitnessTrustCertifyOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { certifyWitnessHub, addCertificateToBundle, exportWitnessTrustAuthorityPublicKey } =
    await import("../../lib/protocol/distribution/witness-trust.js");
  let hubPublicKey = opts.hubPublicKey;
  if (!hubPublicKey) {
    const base = opts.hubUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/hub/v1/public-key`);
    if (!res.ok) {
      console.error(`Failed to fetch hub public key: HTTP ${res.status}`);
      process.exit(1);
    }
    const body = (await res.json()) as { public_key?: string };
    hubPublicKey = body.public_key;
  }
  if (!hubPublicKey) {
    console.error("hub public key required (--hub-public-key or fetch from hub)");
    process.exit(1);
  }
  const cert = certifyWitnessHub({
    hubId: opts.hubId,
    hubUrl: opts.hubUrl,
    hubPublicKey,
    expiresAt: opts.expiresAt,
  });
  const bundle = addCertificateToBundle(cert);
  if (opts.json) {
    console.log(JSON.stringify({ cert, bundle_certificates: bundle.certificates.length }, null, 2));
    return;
  }
  console.log(`✓ certified hub ${cert.hub_id} · cert_id=${cert.cert_id}`);
  console.log(`  authority pubkey: ${exportWitnessTrustAuthorityPublicKey().slice(0, 16)}…`);
}

export interface ProtocolWitnessTrustPublishOptions {
  tenant?: string;
  json?: boolean;
}

export function runProtocolWitnessTrustPublish(opts: ProtocolWitnessTrustPublishOptions): void {
  applyProtocolTenant(opts.tenant);
  const bundle = publishWitnessTrustBundle();
  if (opts.json) {
    console.log(JSON.stringify(bundle, null, 2));
    return;
  }
  console.log(`✓ trust bundle published · ${bundle.certificates.length} certificate(s)`);
  console.log(`  path: ${getWitnessTrustBundlePath()}`);
}

export interface ProtocolWitnessTrustVerifyOptions {
  bundleUrl?: string;
  bundleFile?: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessTrustVerify(
  opts: ProtocolWitnessTrustVerifyOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { fetchWitnessTrustBundle, verifyWitnessTrustBundle, loadWitnessTrustBundle } =
    await import("../../lib/protocol/distribution/witness-trust.js");
  const { readFileSync } = await import("node:fs");
  const { witnessTrustBundleSchema } = await import("../../../schemas/protocol/witness-trust.js");
  let bundle;
  if (opts.bundleUrl) {
    bundle = await fetchWitnessTrustBundle(opts.bundleUrl);
  } else if (opts.bundleFile) {
    bundle = witnessTrustBundleSchema.parse(JSON.parse(readFileSync(opts.bundleFile, "utf-8")));
  } else {
    bundle = loadWitnessTrustBundle();
  }
  if (!bundle) {
    console.error("No trust bundle — use --bundle-url or --bundle-file");
    process.exit(1);
  }
  const result = verifyWitnessTrustBundle(bundle);
  if (opts.json) {
    console.log(JSON.stringify({ ...result, authority_id: bundle.authority.authority_id, certs: bundle.certificates.length }, null, 2));
    return;
  }
  if (result.ok) {
    console.log(`✓ trust bundle valid · authority=${bundle.authority.authority_id} · certs=${bundle.certificates.length}`);
  } else {
    console.error(`✗ trust bundle invalid:`);
    for (const issue of result.issues) console.error(`  · ${issue}`);
    process.exit(1);
  }
}

export interface ProtocolWitnessPoolInitFromTrustOptions {
  bundleUrl: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessPoolInitFromTrust(
  opts: ProtocolWitnessPoolInitFromTrustOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { initWitnessPoolFromTrustBundle } = await import("../../lib/protocol/distribution/contract-witness-pool.js");
  const result = await initWitnessPoolFromTrustBundle(opts.bundleUrl);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ witness-pool.yaml from trust bundle · hubs: ${result.hubs.length}`);
}

export interface ProtocolWitnessPoolInitFromContractOptions {
  contract: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessPoolInitFromContract(
  opts: ProtocolWitnessPoolInitFromContractOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { initWitnessPoolFromContract } = await import("../../lib/protocol/distribution/contract-witness-pool.js");
  const result = await initWitnessPoolFromContract(opts.contract);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ witness-pool.yaml from ${opts.contract} · sla=${result.sla} · hubs: ${result.hubs.length}`);
}

export interface ProtocolWitnessTrustRevokeOptions {
  certId: string;
  hubId: string;
  reason?: string;
  operatorId?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolWitnessTrustRevoke(opts: ProtocolWitnessTrustRevokeOptions): void {
  applyProtocolTenant(opts.tenant);
  const entry = revokeWitnessHubCertificate({
    certId: opts.certId,
    hubId: opts.hubId,
    reason: opts.reason,
    operatorId: opts.operatorId,
  });
  if (opts.json) {
    console.log(JSON.stringify(entry, null, 2));
    return;
  }
  console.log(`✓ revoked hub cert ${opts.hubId} · bundle republished`);
}

export interface ProtocolTrustedHubsSyncKeysOptions {
  jurisdiction?: string;
  hubUrl?: string;
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export async function runProtocolTrustedHubsSyncKeys(
  opts: ProtocolTrustedHubsSyncKeysOptions = {}
): Promise<void> {
  const { syncTrustedHubPublicKeys } = await import("../../lib/protocol/distribution/trusted-hubs-sync.js");
  const { results } = await syncTrustedHubPublicKeys({
    jurisdiction: opts.jurisdiction,
    hubUrl: opts.hubUrl,
    force: opts.force,
    dryRun: opts.dryRun,
  });
  if (opts.json) {
    console.log(JSON.stringify({ results }, null, 2));
    const failed = results.some((r) => r.status === "error");
    if (failed) process.exit(1);
    return;
  }
  for (const r of results) {
    const keyPreview = r.public_key ? `${r.public_key.slice(0, 12)}…` : "";
    console.log(
      `  [${r.status}] ${r.jurisdiction}/${r.hub_id} @ ${r.hub_url}${keyPreview ? ` · ${keyPreview}` : ""}${r.detail ? ` · ${r.detail}` : ""}`
    );
  }
  const failed = results.some((r) => r.status === "error");
  if (failed) process.exit(1);
  if (!results.length) {
    console.log("No hubs matched (check jurisdiction / hub-url filters)");
  } else {
    console.log(`✓ trusted-hubs sync complete (${results.length} hub(s))`);
  }
}

