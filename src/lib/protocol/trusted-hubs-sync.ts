import { readFileSync, writeFileSync } from "node:fs";
import type { TrustedHubsRegistry } from "../../../schemas/protocol/trusted-hubs.js";
import { trustedHubsRegistrySchema } from "../../../schemas/protocol/trusted-hubs.js";
import {
  getTrustedHubsRegistryPath,
} from "./trusted-hubs.js";
import { readYamlFile } from "../utils.js";

export interface HubPublicKeyResponse {
  hub_id: string;
  public_key: string;
}

export async function fetchHubPublicKey(hubUrl: string): Promise<HubPublicKeyResponse> {
  const base = hubUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/hub/v1/public-key`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`${base}/hub/v1/public-key HTTP ${res.status}`);
  }
  const body = (await res.json()) as Partial<HubPublicKeyResponse>;
  if (!body.hub_id || !body.public_key) {
    throw new Error(`${base}/hub/v1/public-key missing hub_id or public_key`);
  }
  return { hub_id: body.hub_id, public_key: body.public_key };
}

export interface TrustedHubSyncResult {
  hub_id: string;
  hub_url: string;
  jurisdiction: string;
  status: "updated" | "skipped" | "unchanged" | "error";
  public_key?: string;
  detail?: string;
}

export interface SyncTrustedHubKeysOptions {
  jurisdiction?: string;
  hubUrl?: string;
  force?: boolean;
  dryRun?: boolean;
  registryPath?: string;
}

function patchHubPublicKeyInYaml(
  yamlText: string,
  hubId: string,
  hubUrl: string,
  publicKey: string
): string {
  const lines = yamlText.split("\n");
  let inTargetHub = false;
  let hubUrlMatches = false;
  let updated = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const hubIdMatch = line.match(/^\s*-\s*hub_id:\s*(.+)$/);
    if (hubIdMatch) {
      inTargetHub = hubIdMatch[1]!.trim() === hubId;
      hubUrlMatches = false;
      continue;
    }
    if (inTargetHub && line.match(/^\s*hub_url:\s*(.+)$/)) {
      const url = line.replace(/^\s*hub_url:\s*/, "").trim();
      hubUrlMatches = url === hubUrl;
      continue;
    }
    if (inTargetHub && hubUrlMatches && line.match(/^\s*hub_public_key:\s*/)) {
      const current = line.replace(/^\s*hub_public_key:\s*/, "").trim();
      if (current !== publicKey) {
        const indent = line.match(/^(\s*)/)?.[1] ?? "        ";
        lines[i] = `${indent}hub_public_key: ${publicKey}`;
        updated = true;
      }
      inTargetHub = false;
      hubUrlMatches = false;
    }
    if (inTargetHub && line.match(/^\s*-\s*hub_id:/)) {
      inTargetHub = false;
      hubUrlMatches = false;
    }
  }

  if (!updated) {
    throw new Error(`Could not locate hub_public_key for ${hubId} @ ${hubUrl} in YAML`);
  }
  return lines.join("\n");
}

export async function syncTrustedHubPublicKeys(
  opts: SyncTrustedHubKeysOptions = {}
): Promise<{ results: TrustedHubSyncResult[]; registry: TrustedHubsRegistry }> {
  const registryPath = opts.registryPath ?? getTrustedHubsRegistryPath();
  const registry = readYamlFile(registryPath, trustedHubsRegistrySchema);
  const results: TrustedHubSyncResult[] = [];
  let yamlText = readFileSync(registryPath, "utf-8");

  for (const entry of registry.jurisdictions) {
    if (opts.jurisdiction && entry.jurisdiction !== opts.jurisdiction) continue;

    for (const hub of entry.hubs) {
      if (opts.hubUrl && hub.hub_url !== opts.hubUrl) continue;

      const hasKey = Boolean(hub.hub_public_key?.trim());
      if (hasKey && !opts.force) {
        results.push({
          hub_id: hub.hub_id,
          hub_url: hub.hub_url,
          jurisdiction: entry.jurisdiction,
          status: "skipped",
          public_key: hub.hub_public_key,
          detail: "hub_public_key already set (use --force)",
        });
        continue;
      }

      try {
        const fetched = await fetchHubPublicKey(hub.hub_url);
        if (fetched.hub_id !== hub.hub_id) {
          results.push({
            hub_id: hub.hub_id,
            hub_url: hub.hub_url,
            jurisdiction: entry.jurisdiction,
            status: "error",
            detail: `hub_id mismatch: registry=${hub.hub_id} remote=${fetched.hub_id}`,
          });
          continue;
        }

        if (hub.hub_public_key === fetched.public_key) {
          results.push({
            hub_id: hub.hub_id,
            hub_url: hub.hub_url,
            jurisdiction: entry.jurisdiction,
            status: "unchanged",
            public_key: fetched.public_key,
          });
          continue;
        }

        if (!opts.dryRun) {
          yamlText = patchHubPublicKeyInYaml(
            yamlText,
            hub.hub_id,
            hub.hub_url,
            fetched.public_key
          );
          hub.hub_public_key = fetched.public_key;
        }

        results.push({
          hub_id: hub.hub_id,
          hub_url: hub.hub_url,
          jurisdiction: entry.jurisdiction,
          status: "updated",
          public_key: fetched.public_key,
          detail: opts.dryRun ? "dry-run" : undefined,
        });
      } catch (e) {
        results.push({
          hub_id: hub.hub_id,
          hub_url: hub.hub_url,
          jurisdiction: entry.jurisdiction,
          status: "error",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  if (!opts.dryRun && results.some((r) => r.status === "updated")) {
    writeFileSync(registryPath, yamlText.endsWith("\n") ? yamlText : `${yamlText}\n`, "utf-8");
  }

  return { results, registry };
}
