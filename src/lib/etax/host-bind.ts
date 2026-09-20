/**
 * Bind tip signature/transport catalogs to hostBound=true after Windows host health.
 * Stub / non-NTA health must never flip tip catalogs.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { etaxError } from "../../../schemas/etax/errors.js";
import { getWorkspaceRoot } from "../orgos-paths.js";
import { isStubOrNonNtaHealth, probeEtaxHostBound } from "./host-client.js";
import {
  etaxSignatureCatalogPath,
  loadSignatureCatalog,
} from "./signature-catalog.js";
import {
  etaxTransportCatalogPath,
  loadTransportCatalog,
} from "./transport-catalog.js";

export async function bindOfficialHostCatalogs(opts: {
  actor: string;
  iUnderstandWindows: boolean;
}): Promise<{
  signaturePath: string;
  transportPath: string;
  healthDetail: string;
}> {
  if (process.platform !== "win32") {
    throw etaxError({
      code: "ETAX_HOST_BIND_NOT_WINDOWS",
      blocked: "SPEC_BLOCKED",
      message: "etax host bind requires Windows (Darwin/Linux cannot set tip hostBound=true)",
    });
  }
  if (!opts.iUnderstandWindows) {
    throw etaxError({
      code: "ETAX_HOST_BIND_FLAG_REQUIRED",
      blocked: "SPEC_BLOCKED",
      message: "Pass --i-understand-windows after confirming NTA COM modules are installed",
    });
  }
  const probe = await probeEtaxHostBound();
  if (!probe.health || isStubOrNonNtaHealth(probe.health)) {
    throw etaxError({
      code: "ETAX_HOST_BIND_STUB_FORBIDDEN",
      blocked: "SPEC_BLOCKED",
      message:
        `Refusing to bind tip catalogs to a stub/non-NTA host ` +
        `(${probe.error ?? probe.health?.detail ?? "stub"}). Use ORGOS_ETAX_HOST_MODE=com with NTA modules.`,
    });
  }
  if (!probe.reachable || !probe.health.signatureBound || !probe.health.transportBound) {
    throw etaxError({
      code: "ETAX_HOST_BIND_UNHEALTHY",
      blocked: "SPEC_BLOCKED",
      message: `etax-host health failed: ${probe.error ?? probe.health.detail ?? "unreachable"}`,
    });
  }

  const sigPath = etaxSignatureCatalogPath();
  const trPath = etaxTransportCatalogPath();
  const sig = loadSignatureCatalog();
  const tr = loadTransportCatalog();

  writeFileSync(sigPath, `${YAML.stringify({ ...sig, hostBound: true })}\n`, "utf-8");
  writeFileSync(trPath, `${YAML.stringify({ ...tr, hostBound: true })}\n`, "utf-8");

  const logDir = join(getWorkspaceRoot(), "data", "etax", "transmission-test");
  mkdirSync(logDir, { recursive: true });
  const logLine = [
    `at=${new Date().toISOString()}`,
    `actor=${opts.actor}`,
    `platform=${process.platform}`,
    `methods=${(probe.health.methods ?? []).join(",")}`,
    `detail=${probe.health.detail ?? ""}`,
    "action=host.bind",
    "secrets=none",
  ].join(" ");
  writeFileSync(join(logDir, "host-bind-log.txt"), `${logLine}\n`, { flag: "a" });

  return {
    signaturePath: sigPath,
    transportPath: trPath,
    healthDetail: probe.health.detail ?? "ok",
  };
}

export function readCatalogHostBoundTip(): {
  signature: boolean;
  transport: boolean;
} {
  return {
    signature: loadSignatureCatalog().hostBound === true,
    transport: loadTransportCatalog().hostBound === true,
  };
}
