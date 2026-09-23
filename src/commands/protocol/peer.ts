/** Peer registration and discovery command handlers. */
import { loadTenantConfig } from "../../lib/tenant.js";
import { applyProtocolTenant } from "./shared.js";
import {
  listDiscoverablePeers,
  listPeerRegistrationSuggestions,
} from "../../lib/protocol/transport/peer-discovery.js";
import {
  registerPeer,
  nextPeerId,
} from "../../lib/protocol/transport/peers.js";
import { migrateLegacyWebhookPeers } from "../../lib/protocol/transport/peers-migrate-legacy.js";
import { readFileSync } from "node:fs";
import { orgIdentityDocumentSchema } from "../../../schemas/protocol/identity-exchange.js";


export interface ProtocolPeerRegisterOptions {
  stakeholder?: string;
  name: string;
  jurisdiction: string;
  peerId?: string;
  orgUri?: string;
  publicKey?: string;
  identityFile?: string;
  webhookUrl?: string;
  tenant?: string;
}

export function runProtocolPeerRegister(opts: ProtocolPeerRegisterOptions): void {
  applyProtocolTenant(opts.tenant);
  const peerId = opts.peerId ?? nextPeerId();
  let protocolPublicKey = opts.publicKey;
  if (opts.identityFile) {
    const raw = JSON.parse(readFileSync(opts.identityFile, "utf-8")) as Record<string, unknown>;
    const docDirect = orgIdentityDocumentSchema.safeParse(raw);
    if (docDirect.success) {
      protocolPublicKey = docDirect.data.protocol_public_key ?? protocolPublicKey;
    } else if (typeof raw === "object" && raw !== null && "event" in raw) {
      const payload = (raw as { event?: { payload?: { identity?: unknown } } }).event?.payload
        ?.identity;
      const docInner = orgIdentityDocumentSchema.safeParse(payload);
      if (docInner.success) {
        protocolPublicKey = docInner.data.protocol_public_key ?? protocolPublicKey;
      }
    }
  }
  const profile = registerPeer({
    peer_id: peerId,
    display_name: opts.name,
    jurisdiction: opts.jurisdiction,
    stakeholder_id: opts.stakeholder,
    org_uri: opts.orgUri,
    protocol_public_key: protocolPublicKey,
    inbound_webhook_url: opts.webhookUrl,
  });
  console.log(`✓ Registered peer ${profile.peer_id} · ${profile.display_name}`);
  if (profile.protocol_public_key) console.log(`  protocol_public_key: set`);
  if (profile.inbound_webhook_url) console.log(`  inbound_webhook_url: ${profile.inbound_webhook_url}`);
}

export interface ProtocolPeersMigrateLegacyOptions {
  tenant?: string;
  apply?: boolean;
  toWireUrl?: string;
  json?: boolean;
}

export function runProtocolPeersMigrateLegacy(opts: ProtocolPeersMigrateLegacyOptions = {}): void {
  applyProtocolTenant(opts.tenant);
  const { results, apply } = migrateLegacyWebhookPeers({
    apply: opts.apply,
    toWireUrl: opts.toWireUrl,
  });
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          apply,
          results,
          sunset: "2026-10-01",
          canonical_transport: "wire_v1",
          internal_webhook_note:
            "`orgos webhook` is an internal automation queue integration and is not this Wire transport",
        },
        null,
        2
      )
    );
    return;
  }
  console.warn(
    "WARNING: legacy_webhook is deprecated and retained only until 2026-10-01."
  );
  console.warn(
    "This is Wire peer transport, not the internal `orgos webhook` automation command."
  );
  console.log(`peers migrate-legacy · ${apply ? "apply" : "dry-run"}`);
  for (const r of results) {
    console.log(`  [${r.status}] ${r.peer_id}${r.detail ? ` · ${r.detail}` : ""}`);
  }
  if (!opts.toWireUrl) {
    console.log(
      "  Migration remains legacy. Re-run with --to-wire-url https://<gateway>/wire/v1/events to move to wire_v1."
    );
  }
}

export interface ProtocolPeerDiscoverOptions {
  jurisdiction?: string;
  tenant?: string;
  json?: boolean;
  suggest?: boolean;
}

export function runProtocolPeerDiscover(opts: ProtocolPeerDiscoverOptions): void {
  applyProtocolTenant(opts.tenant);
  const jurisdiction = opts.jurisdiction ?? loadTenantConfig().jurisdiction ?? "JP";
  if (opts.suggest) {
    const suggestions = listPeerRegistrationSuggestions(jurisdiction);
    if (opts.json) {
      console.log(JSON.stringify({ jurisdiction, count: suggestions.length, suggestions }, null, 2));
      return;
    }
    console.log(`Peer registration suggestions (${jurisdiction}): ${suggestions.length}`);
    for (const s of suggestions) {
      const id = s.entry.peer_id ?? s.entry.hub_id ?? "?";
      console.log(`  · ${id}: ${s.register_command}`);
    }
    return;
  }
  const entries = listDiscoverablePeers({ jurisdiction });
  if (opts.json) {
    console.log(JSON.stringify({ jurisdiction, count: entries.length, entries }, null, 2));
    return;
  }
  console.log(`Discoverable peers/hubs (${jurisdiction}): ${entries.length}`);
  for (const entry of entries) {
    const id = entry.peer_id ?? entry.hub_id ?? "?";
    console.log(
      `  · [${entry.source}] ${id} — ${entry.display_name} (${entry.registered ? "registered" : "catalog"})`
    );
  }
}


export {
  runProtocolIdentityExport,
  runProtocolIdentityValidate,
} from "./identity.js";
export type {
  ProtocolIdentityExportOptions,
  ProtocolIdentityValidateOptions,
} from "./identity.js";

export {
  runProtocolTrustRegistryValidate,
  runProtocolTrustRegistryList,
  runProtocolTrustRegistryResolve,
  runProtocolTrustRegistrySyncKeys,
  runProtocolTrustRegistryPinLocal,
  runProtocolTrustRegistrySubmit,
  runProtocolTrustRegistryDecide,
  runProtocolTrustRegistryPending,
} from "./trust.js";
export type {
  ProtocolTrustRegistryValidateOptions,
  ProtocolTrustRegistryListOptions,
  ProtocolTrustRegistryResolveOptions,
  ProtocolTrustRegistrySyncKeysOptions,
  ProtocolTrustRegistryPinLocalOptions,
  ProtocolTrustRegistrySubmitOptions,
  ProtocolTrustRegistryDecideOptions,
  ProtocolTrustRegistryPendingOptions,
} from "./trust.js";
