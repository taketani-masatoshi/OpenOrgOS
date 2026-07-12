import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  govGatewayConfigSchema,
  govGatewayRegistrySchema,
  type GovGatewayConfig,
  type GovGatewayProfileBinding,
  type GovGatewayProfileId,
  type GovGatewayRegistry,
} from "../../../../schemas/protocol/gov-gateway-adapter.js";
import {
  govGatewayProfileDocumentSchema,
  resolveProfileEntry,
  type GovGatewayProfileDocument,
} from "../../../../schemas/protocol/gov-gateway-profile.js";
import { getInstallRoot } from "../../orgos-paths.js";
import { readYamlFile } from "../../utils.js";
import { getGovGatewayYamlPath } from "../../protocol/paths.js";
import { STEWARD_PLATFORM_DIR } from "../../steward-paths.js";
import type { GovGatewayTransport, GovGatewayAdapter } from "./types.js";
import { getDefaultGovGatewayTransport } from "./transport-http.js";
import { createXRoadV7Adapter } from "./adapters/xroad-v7.js";
import { createJpEgovCentralAdapter } from "./adapters/jp-egov-central.js";
import { createGe3gAdapter } from "./adapters/ge-3g.js";
import { createStubAdapter } from "./adapters/stub.js";

const REGISTRY_PATH = join(STEWARD_PLATFORM_DIR, "protocol", "gov-gateway-adapters.yaml");

export function loadGovGatewayConfig(): GovGatewayConfig | null {
  const path = getGovGatewayYamlPath();
  if (!existsSync(path)) return null;
  return readYamlFile(path, govGatewayConfigSchema);
}

export function loadGovGatewayRegistry(): GovGatewayRegistry {
  const path = existsSync(REGISTRY_PATH)
    ? REGISTRY_PATH
    : join(getInstallRoot(), "steward", "platform", "protocol", "gov-gateway-adapters.yaml");
  if (!existsSync(path)) {
    return govGatewayRegistrySchema.parse({ version: "1", adapters: [] });
  }
  return readYamlFile(path, govGatewayRegistrySchema);
}

export function resolveProfileYamlPath(adapterRef: string): string {
  if (adapterRef.startsWith("/")) return adapterRef;
  return join(getInstallRoot(), adapterRef);
}

export function loadGovGatewayProfileDocument(adapterRef: string): GovGatewayProfileDocument {
  const path = resolveProfileYamlPath(adapterRef);
  return readYamlFile(path, govGatewayProfileDocumentSchema);
}

export function findProfileBinding(
  config: GovGatewayConfig | null,
  profileId: GovGatewayProfileId
): GovGatewayProfileBinding | undefined {
  return config?.profiles.find((p) => p.profile_id === profileId && p.enabled !== false);
}

export function resolveAdapter(
  profileId: GovGatewayProfileId,
  binding?: GovGatewayProfileBinding,
  transport: GovGatewayTransport = getDefaultGovGatewayTransport()
): GovGatewayAdapter {
  const registry = loadGovGatewayRegistry();
  const entry = registry.adapters.find((a) => a.profile_id === profileId);
  if (!entry) {
    return createStubAdapter(profileId, `profile ${profileId} not in registry`);
  }

  const doc = loadGovGatewayProfileDocument(entry.profile_ref);
  const profileEntry = resolveProfileEntry(doc, profileId);
  if (!profileEntry) {
    return createStubAdapter(profileId, `profile ${profileId} not in ${entry.profile_ref}`);
  }

  switch (profileId) {
    case "xroad_v7":
    case "xroad_v6":
    case "xroad_v7_dj":
      return createXRoadV7Adapter({ transport, binding, profileDoc: doc, profileId });
    case "jp_egov_central":
      return createJpEgovCentralAdapter({ transport, binding, profileEntry });
    case "ge_gov_gateway_3g":
      return createGe3gAdapter({ transport, binding, profileDoc: doc });
    default:
      return createStubAdapter(profileId, `adapter not implemented for ${profileId}`);
  }
}

export interface GovGatewayValidateIssue {
  code: string;
  message: string;
  path?: string;
}

export function validateGovGatewaySetup(tenantConfig?: GovGatewayConfig | null): {
  ok: boolean;
  issues: GovGatewayValidateIssue[];
} {
  const issues: GovGatewayValidateIssue[] = [];
  const registry = loadGovGatewayRegistry();
  const config = tenantConfig ?? loadGovGatewayConfig();

  if (!registry.adapters.length) {
    issues.push({ code: "registry_empty", message: "gov-gateway-adapters.yaml has no entries" });
  }

  for (const entry of registry.adapters) {
    const profilePath = resolveProfileYamlPath(entry.profile_ref);
    if (!existsSync(profilePath)) {
      // Draft placeholders may lack jurisdiction-pack YAML until Hub Wave N.
      if (entry.status === "draft") {
        issues.push({
          code: "profile_pending",
          message: `draft profile file not yet present: ${entry.profile_ref}`,
          path: entry.profile_ref,
        });
        continue;
      }
      issues.push({
        code: "profile_missing",
        message: `profile file missing: ${entry.profile_ref}`,
        path: entry.profile_ref,
      });
      continue;
    }
    try {
      loadGovGatewayProfileDocument(entry.profile_ref);
    } catch (e) {
      issues.push({
        code: "profile_invalid",
        message: e instanceof Error ? e.message : String(e),
        path: entry.profile_ref,
      });
    }
  }

  if (config) {
    try {
      govGatewayConfigSchema.parse(config);
    } catch (e) {
      issues.push({
        code: "tenant_config_invalid",
        message: e instanceof Error ? e.message : String(e),
        path: getGovGatewayYamlPath(),
      });
    }

    for (const profile of config.profiles) {
      const reg = registry.adapters.find((a) => a.profile_id === profile.profile_id);
      if (!reg) {
        issues.push({
          code: "profile_unregistered",
          message: `tenant profile ${profile.profile_id} not in registry`,
        });
      }
      if (profile.adapter_ref && !existsSync(resolveProfileYamlPath(profile.adapter_ref))) {
        issues.push({
          code: "tenant_profile_ref_missing",
          message: `adapter_ref missing: ${profile.adapter_ref}`,
          path: profile.adapter_ref,
        });
      }
    }
  }

  const blocking = issues.filter((i) => i.code !== "profile_pending");
  return { ok: blocking.length === 0, issues };
}
