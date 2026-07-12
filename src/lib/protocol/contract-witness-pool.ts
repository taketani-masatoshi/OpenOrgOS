import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ContractProtocolConfig } from "../../../schemas/protocol/contract-protocol.js";
import type { WitnessHubEntry } from "../../../schemas/protocol/witness-pool.js";
import type { WitnessHubCertificate } from "../../../schemas/protocol/witness-trust.js";
import { contractSchema } from "../../../schemas/contract.js";
import { getDataDir, readYamlFile } from "../utils.js";
import { fetchWitnessTrustBundle, verifiedHubsFromBundle } from "./witness-trust.js";
import { defaultSlaTierForContract } from "./resilience-sla.js";
import { writeWitnessPoolConfig } from "./witness-pool-persist.js";

export function loadContractById(contractId: string) {
  const path = join(getDataDir(), "contracts", `${contractId}.yaml`);
  if (!existsSync(path)) {
    throw new Error(`Contract ${contractId} not found`);
  }
  return contractSchema.parse(readYamlFile(path, contractSchema));
}

function resolveHubsFromProtocolConfig(
  protocol: ContractProtocolConfig,
  bundleCerts: WitnessHubCertificate[]
): WitnessHubEntry[] {
  const refs = protocol.witness_hubs ?? [];
  const hubs: WitnessHubEntry[] = [];

  for (const ref of refs) {
    let cert = bundleCerts.find((c) => c.cert_id === ref.trust_cert_id);
    if (!cert) {
      cert = bundleCerts.find((c) => c.hub_id === ref.hub_id);
    }
    if (cert) {
      hubs.push({
        hub_id: cert.hub_id,
        hub_url: ref.hub_url ?? cert.hub_url,
        hub_public_key: cert.hub_public_key,
        priority: hubs.length + 1,
      });
      continue;
    }
    if (ref.hub_url) {
      throw new Error(
        `Hub ${ref.hub_id} requires trust certificate or hub_public_key via trust bundle`
      );
    }
  }

  if (hubs.length === 0 && bundleCerts.length > 0) {
    for (const cert of bundleCerts) {
      hubs.push({
        hub_id: cert.hub_id,
        hub_url: cert.hub_url,
        hub_public_key: cert.hub_public_key,
        priority: hubs.length + 1,
      });
    }
  }

  return hubs;
}

export async function initWitnessPoolFromContract(contractId: string): Promise<{
  path: string;
  hubs: WitnessHubEntry[];
  sla: string;
}> {
  const contract = loadContractById(contractId);
  const protocol =
    contract.protocol ??
    ({
      resilience_sla: defaultSlaTierForContract(contract.monthly_cost),
    } satisfies ContractProtocolConfig);

  let bundleCerts: WitnessHubCertificate[] = [];
  const bundleUrl = protocol.witness_trust_bundle_url;
  if (bundleUrl) {
    const bundle = await fetchWitnessTrustBundle(bundleUrl);
    bundleCerts = verifiedHubsFromBundle(bundle);
  }

  const hubs = resolveHubsFromProtocolConfig(protocol, bundleCerts);
  if (hubs.length === 0) {
    throw new Error(`No witness hubs resolved for contract ${contractId}`);
  }

  const quorumMode = protocol.resilience_sla === "gold" ? "k_of_n" : "any_of_n";
  const k = protocol.resilience_sla === "gold" ? Math.min(2, hubs.length) : 1;
  const isGold = protocol.resilience_sla === "gold";

  const { path } = writeWitnessPoolConfig({
    hubs,
    quorum: { mode: quorumMode, k },
    wire_governance_policy: {
      require_quorum_for_tiers: isGold ? ["A", "B", "C"] : ["B", "C"],
      warn_only: !isGold,
    },
  });
  return { path, hubs, sla: protocol.resilience_sla };
}

export async function initWitnessPoolFromTrustBundle(bundleUrl: string): Promise<{
  path: string;
  hubs: WitnessHubEntry[];
}> {
  const bundle = await fetchWitnessTrustBundle(bundleUrl);
  const certs = verifiedHubsFromBundle(bundle);
  const hubs: WitnessHubEntry[] = certs.map((cert, i) => ({
    hub_id: cert.hub_id,
    hub_url: cert.hub_url,
    hub_public_key: cert.hub_public_key,
    priority: i + 1,
  }));

  return writeWitnessPoolConfig({
    hubs,
    quorum: {
      mode: hubs.length >= 2 ? "k_of_n" : "any_of_n",
      k: Math.min(2, hubs.length),
    },
  });
}

export interface WitnessPoolBindResult {
  bound: boolean;
  contract_id: string;
  path?: string;
  hub_count?: number;
  sla?: string;
  skipped_reason?: string;
  error?: string;
}

/** Best-effort witness pool bind from contract protocol block (approve hook). */
export async function maybeBindWitnessPoolFromContract(
  contractId: string | undefined
): Promise<WitnessPoolBindResult | null> {
  if (!contractId) return null;
  try {
    const contract = loadContractById(contractId);
    const protocol = contract.protocol;
    if (!protocol?.witness_trust_bundle_url && !protocol?.witness_hubs?.length) {
      return {
        bound: false,
        contract_id: contractId,
        skipped_reason: "no protocol.witness_trust_bundle_url or witness_hubs",
      };
    }
    const result = await initWitnessPoolFromContract(contractId);
    return {
      bound: true,
      contract_id: contractId,
      path: result.path,
      hub_count: result.hubs.length,
      sla: result.sla,
    };
  } catch (e) {
    return {
      bound: false,
      contract_id: contractId,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
