import { existsSync } from "node:fs";
import { peersRegistrySchema } from "../../../schemas/protocol/peers.js";
import { readYamlFile, resolveTenantPath } from "../utils.js";
import { getPeersYamlPath } from "../protocol/paths.js";
import {
  isExternalWirePeerOrgUri,
  peerTenantContactL1Available,
  peerTenantExists,
  tenantIdFromPeerOrgUri,
} from "./peer-contact-policy.js";

export interface PeerContactRegistryIssue {
  code: string;
  file: string;
  message: string;
  level: "error" | "warning";
}

export function validatePeerContactRegistry(): PeerContactRegistryIssue[] {
  const issues: PeerContactRegistryIssue[] = [];

  const peersPath = getPeersYamlPath();
  const peersExample = resolveTenantPath("data/protocol/peers.yaml.example");
  if (!existsSync(peersPath) && !existsSync(peersExample)) {
    issues.push({
      code: "protocol-peers-scaffold-missing",
      file: "data/protocol/peers.yaml.example",
      level: "warning",
      message:
        "protocol peer 台帳 example 未作成 — tenant init / scaffold で seed 推奨（Secretary 照合 gate 用）",
    });
  }

  const extExample = resolveTenantPath("data/executive/external-contacts.yaml.example");
  const extData = resolveTenantPath("data/executive/external-contacts.yaml");
  if (!existsSync(extExample) && !existsSync(extData)) {
    issues.push({
      code: "executive-external-contacts-scaffold-missing",
      file: "data/executive/external-contacts.yaml.example",
      level: "warning",
      message: "external-contacts example 未作成 — cp example または orgos tenant scaffold-data",
    });
  }

  if (!existsSync(peersPath)) {
    return issues;
  }

  try {
    const peers = readYamlFile(peersPath, peersRegistrySchema);
    for (const peer of peers.peers) {
      const tenantId = tenantIdFromPeerOrgUri(peer.org_uri);
      if (peer.org_uri && isExternalWirePeerOrgUri(peer.org_uri)) {
        continue;
      }
      if (!peer.org_uri) {
        issues.push({
          code: "peer-org-uri-missing",
          file: "data/protocol/peers.yaml",
          level: "warning",
          message: `${peer.peer_id} (${peer.display_name}): org_uri 未設定 — Secretary contacts resolve の peer 横断不可（wire のみ）`,
        });
        continue;
      }
      if (!tenantId) {
        issues.push({
          code: "peer-org-uri-invalid",
          file: "data/protocol/peers.yaml",
          level: "warning",
          message: `${peer.peer_id}: org_uri "${peer.org_uri}" は steward://tenant/{id} 形式ではない — Secretary peer gate 対象外`,
        });
        continue;
      }
      if (!peerTenantExists(tenantId)) {
        issues.push({
          code: "peer-tenant-missing",
          file: "data/protocol/peers.yaml",
          level: "error",
          message: `${peer.peer_id} → steward://tenant/${tenantId} だが tenants/${tenantId}/tenant.yaml が存在しない`,
        });
        continue;
      }
      if (!peerTenantContactL1Available(tenantId)) {
        issues.push({
          code: "peer-tenant-l1-contacts-missing",
          file: "data/protocol/peers.yaml",
          level: "warning",
          message: `${peer.peer_id} → tenant/${tenantId} に company.yaml / external-contacts.yaml が無い — peer 照合結果が空になる`,
        });
      }
    }
  } catch (e) {
    issues.push({
      code: "peers-invalid",
      file: "data/protocol/peers.yaml",
      level: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return issues;
}
