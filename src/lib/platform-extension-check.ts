/**
 * Extension readiness checks for platform work (modules · agents · wire).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { listCatalogAgents } from "./agent-catalog.js";
import { validateAgentActivationContract } from "./agent-activation-verify.js";
import { verifyPlatformRegistry } from "./platform-registry-verify.js";
import { validateProtocolLayerCatalog } from "./protocol/layer-catalog.js";
import { buildOrgOsCommandProgram } from "./cli-program.js";
import { buildCliCommandCatalog, validateCliCommandCatalog } from "./cli-command-catalog.js";
import { validateLegacyWebhookSunset } from "./protocol/legacy-webhook-sunset.js";
import { ROOT_DIR } from "./tenant.js";

export interface PlatformExtensionCheck {
  id: string;
  ok: boolean;
  detail: string;
}

const REQUIRED_DOCS = [
  "docs/org-os/openorgos-core-philosophy.md",
  "steward/rules/tool-neutral-development.md",
  "steward/modules/module_contract.md",
  "docs/org-os/wire-gateway-requirements.md",
] as const;

export function runPlatformExtensionChecks(): PlatformExtensionCheck[] {
  const checks: PlatformExtensionCheck[] = [];

  for (const rel of REQUIRED_DOCS) {
    const ok = existsSync(join(ROOT_DIR, rel));
    checks.push({
      id: `doc:${rel}`,
      ok,
      detail: ok ? "present" : "missing",
    });
  }

  const advisor = listCatalogAgents().find((a) => a.id === "platform_guide");
  checks.push({
    id: "advisor:platform_guide",
    ok:
      advisor?.class === "advisor" && advisor.auto_route === false && advisor.auto_pulse === false,
    detail: advisor
      ? `class=${advisor.class} auto_route=${advisor.auto_route} auto_pulse=${advisor.auto_pulse}`
      : "missing from catalog",
  });

  const activationIssues = validateAgentActivationContract();
  checks.push({
    id: "agent:activation-contract",
    ok: activationIssues.length === 0,
    detail: activationIssues.length === 0 ? "OK" : `${activationIssues.length} issue(s)`,
  });

  const layerIssues = validateProtocolLayerCatalog();
  checks.push({
    id: "protocol:layer-catalog",
    ok: layerIssues.length === 0,
    detail: layerIssues.length === 0 ? "OK" : layerIssues.join("; "),
  });

  const cliEntries = buildCliCommandCatalog(buildOrgOsCommandProgram());
  const cliIssues = validateCliCommandCatalog(cliEntries);
  checks.push({
    id: "cli:wire-facade",
    ok: cliIssues.length === 0,
    detail:
      cliIssues.length === 0
        ? `${cliEntries.length} commands · wire facade OK`
        : cliIssues.join("; "),
  });

  const legacyIssues = validateLegacyWebhookSunset(true);
  checks.push({
    id: "wire:legacy-webhook-sunset",
    ok: legacyIssues.length === 0,
    detail:
      legacyIssues.length === 0
        ? "no legacy_webhook Wire peers in managed tenants"
        : `${legacyIssues.length} legacy peer(s)`,
  });

  const registryIssues = verifyPlatformRegistry();
  checks.push({
    id: "registry:verify",
    ok: registryIssues.length === 0,
    detail: registryIssues.length === 0 ? "OK" : `${registryIssues.length} issue(s)`,
  });

  return checks;
}

export function formatPlatformExtensionReport(checks: PlatformExtensionCheck[]): string {
  const lines = ["# Platform Extension Check", ""];
  for (const check of checks) {
    lines.push(`- ${check.ok ? "✓" : "✗"} ${check.id}: ${check.detail}`);
  }
  const failed = checks.filter((c) => !c.ok);
  lines.push("", `**Result:** ${failed.length === 0 ? "PASS" : `FAIL (${failed.length})`}`);
  return lines.join("\n");
}
