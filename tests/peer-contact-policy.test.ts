import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getTenantsDir } from "../src/lib/orgos-paths.js";
import { resolveContactRegistry } from "../src/lib/secretary/contact-registry.js";
import {
  tenantIdFromPeerOrgUri,
  peerTenantExists,
} from "../src/lib/secretary/peer-contact-policy.js";
import { validatePeerContactRegistry } from "../src/lib/secretary/validate-peer-contact-registry.js";
import { seedProtocolYamlFromExamples } from "../src/lib/tenant-scaffold.js";

describe("peer contact policy", () => {
  it("parses steward://tenant/{id} only", () => {
    expect(tenantIdFromPeerOrgUri("steward://tenant/mal")).toBe("mal");
    expect(tenantIdFromPeerOrgUri("steward://peer/PEER-001")).toBeUndefined();
    expect(tenantIdFromPeerOrgUri(undefined)).toBeUndefined();
  });

  it("does not use peer_id fallback for contact resolve", () => {
    const demoTenant = join(getTenantsDir(), "demo", "tenant.yaml");
    if (!existsSync(demoTenant)) return;

    setTenantId("demo");
    const protocolDir = join(getDataDir(), "protocol");
    mkdirSync(protocolDir, { recursive: true });
    writeFileSync(
      join(protocolDir, "peers.yaml"),
      YAML.stringify({
        peers: [
          {
            peer_id: "PEER-099",
            display_name: "MAL",
            jurisdiction: "JP",
            // org_uri intentionally missing — must NOT read mal via peer_id
          },
        ],
      }),
      "utf-8"
    );

    const malRep = resolveContactRegistry({ org: "MAL", name: "段" });
    const fromPeerTenant = malRep.matches.filter((m) => m.scope === "peer_tenant");
    expect(fromPeerTenant).toHaveLength(0);
  });
});

describe("validate peer contact registry", () => {
  beforeEach(() => setTenantId("demo"));

  afterEach(() => {
    const p = join(getDataDir(), "protocol", "peers.yaml");
    if (existsSync(p)) rmSync(p);
  });

  it("warns when org_uri missing", () => {
    const protocolDir = join(getDataDir(), "protocol");
    mkdirSync(protocolDir, { recursive: true });
    writeFileSync(
      join(protocolDir, "peers.yaml"),
      YAML.stringify({
        peers: [{ peer_id: "PEER-001", display_name: "Acme", jurisdiction: "JP" }],
      }),
      "utf-8"
    );
    const issues = validatePeerContactRegistry();
    expect(issues.some((i) => i.code === "peer-org-uri-missing")).toBe(true);
  });

  it("errors when peer tenant does not exist", () => {
    const protocolDir = join(getDataDir(), "protocol");
    mkdirSync(protocolDir, { recursive: true });
    writeFileSync(
      join(protocolDir, "peers.yaml"),
      YAML.stringify({
        peers: [
          {
            peer_id: "PEER-001",
            display_name: "Ghost",
            jurisdiction: "JP",
            org_uri: "steward://tenant/no-such-tenant-xyz",
          },
        ],
      }),
      "utf-8"
    );
    const issues = validatePeerContactRegistry();
    expect(issues.some((i) => i.code === "peer-tenant-missing")).toBe(true);
  });
});

describe("tenant scaffold protocol seed", () => {
  it("seeds empty peers.yaml when example missing", () => {
    setTenantId("demo");
    const protocolDir = join(getDataDir(), "protocol");
    const target = join(protocolDir, "peers.yaml");
    if (existsSync(target)) rmSync(target);

    seedProtocolYamlFromExamples(getDataDir(), false, { created: [], skipped: [] });
    expect(existsSync(target)).toBe(true);
    const doc = YAML.parse(readFileSync(target, "utf-8")) as { peers: unknown[] };
    expect(Array.isArray(doc.peers)).toBe(true);
  });
});

describe("mal tenant exists for peer policy", () => {
  it("mal is a valid peer target tenant", () => {
    expect(peerTenantExists("mal")).toBe(true);
  });
});
