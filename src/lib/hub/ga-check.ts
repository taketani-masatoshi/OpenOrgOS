/**
 * Witness Hub public-relay GA checklist (code + deploy files).
 * Does not mint live certs or stand up Internet relays.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";
import { isHubPublicMode } from "./public-bind.js";

export type HubGaCheck = {
  id: string;
  pass: boolean;
  detail: string;
};

export type HubGaReport = {
  ok: boolean;
  ready_for_public_relay: boolean;
  checks: HubGaCheck[];
};

function deployHubDir(): string {
  return join(getInstallRoot(), "deploy", "witness-hub");
}

export function buildWitnessHubGaReport(): HubGaReport {
  const hub = deployHubDir();
  const root = getInstallRoot();
  const tlsDir = join(hub, "tls");
  const checks: HubGaCheck[] = [
    {
      id: "compose-reference",
      pass: existsSync(join(hub, "docker-compose.yaml")),
      detail: "deploy/witness-hub/docker-compose.yaml",
    },
    {
      id: "compose-n4",
      pass: existsSync(join(hub, "docker-compose.cities.yaml")),
      detail: "city compose (hub-a..d, k=3)",
    },
    {
      id: "compose-tls",
      pass: existsSync(join(hub, "docker-compose.tls.yaml")),
      detail: "TLS overlay for public HTTPS",
    },
    {
      id: "compose-mtls",
      pass: existsSync(join(hub, "docker-compose.mtls.yaml")),
      detail: "mTLS overlay (--tls-ca --mtls-required)",
    },
    {
      id: "trusted-hubs-catalog",
      pass: existsSync(join(hub, "hubs-city.yaml")),
      detail: "hubs-city.yaml operator catalog",
    },
    {
      id: "systemd-unit",
      pass: existsSync(join(hub, "systemd/steward-hub@.service")),
      detail: "systemd template",
    },
    {
      id: "prometheus-scrape",
      pass: existsSync(join(root, "src/lib/hub-server.ts")),
      detail: "GET /metrics Prometheus text (hub serve)",
    },
    {
      id: "tls-material",
      pass:
        existsSync(join(tlsDir, "server.pem")) && existsSync(join(tlsDir, "server.key")),
      detail: existsSync(join(tlsDir, "server.pem"))
        ? "dev/prod TLS present under deploy/witness-hub/tls"
        : "run orgos hub tls-init (certs are gitignored)",
    },
  ];
  const publicMode = isHubPublicMode();
  const blocking = publicMode
    ? checks
    : checks.filter((row) => row.id !== "tls-material");
  const ok = blocking.every((row) => row.pass);
  const tls = checks.find((row) => row.id === "tls-material")?.pass === true;
  return {
    ok,
    ready_for_public_relay: ok && tls,
    checks,
  };
}
