import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTenantId, getDataDir } from "../src/lib/utils.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import {
  submitWireNodeGovernanceRequest,
  decideWireNodeGovernanceRequest,
  loadWireNodeGovernanceRegistry,
} from "../src/lib/protocol/wire-node-governance.js";
import { readYamlFile } from "../src/lib/utils.js";
import { wireTrustRegistrySchema } from "../schemas/protocol/wire-trust-registry.js";

describe("wire trust registry governance", () => {
  let tmpDir: string;
  let govPath: string;
  let trustPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `wire-gov-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    govPath = join(tmpDir, "wire-node-governance.yaml");
    trustPath = join(tmpDir, "wire-trust-registry.yaml");
    writeFileSync(
      govPath,
      `version: "1"
committee_id: ORGOS-JP-COMMITTEE
governance_requests: []
`,
      "utf-8"
    );
    writeFileSync(
      trustPath,
      `version: "1"
nodes: []
`,
      "utf-8"
    );

    setTenantId("demo");
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "company.yaml"),
      `name: Demo Co
corporate_number: "4010001199703"
public_disclosure:
  representative_email: ceo@demo.example
  internal_domains:
    - demo.example
`,
      "utf-8"
    );
    writeFileSync(
      join(getDataDir(), "protocol", "wire-gateway.yaml"),
      `node_id: demo-gov-node
node_uri: steward://tenant/demo
display_name: Demo Co
internal_api:
  base_url: https://wire.demo.example
`,
      "utf-8"
    );
    ensureProtocolSigningKey();
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("submit → decide approve merges node into trust registry", () => {
    const request = submitWireNodeGovernanceRequest({
      tenantId: "demo",
      wireEmail: "wire-notices@demo.example",
      governancePath: govPath,
      trustRegistryPath: trustPath,
    });
    expect(request.status).toBe("pending");
    expect(request.did).toMatch(/^did:ooo:org:pk-[a-f0-9]{16}$/);

    const { node } = decideWireNodeGovernanceRequest({
      requestId: request.request_id,
      approve: true,
      decidedBy: "CHAIR",
      governancePath: govPath,
      trustRegistryPath: trustPath,
    });
    expect(node?.node_id).toBe("demo-gov-node");

    const trust = readYamlFile(trustPath, wireTrustRegistrySchema);
    expect(trust.nodes.some((n) => n.node_id === "demo-gov-node")).toBe(true);

    const reg = loadWireNodeGovernanceRegistry(govPath);
    expect(reg.governance_requests[0]?.status).toBe("approved");
  });

  it("rejects duplicate corporate_number on submit", () => {
    submitWireNodeGovernanceRequest({
      tenantId: "demo",
      wireEmail: "wire-notices@demo.example",
      corporateNumber: "4010001199703",
      governancePath: govPath,
      trustRegistryPath: trustPath,
    });
    decideWireNodeGovernanceRequest({
      requestId: loadWireNodeGovernanceRegistry(govPath).governance_requests[0]!.request_id,
      approve: true,
      decidedBy: "CHAIR",
      governancePath: govPath,
      trustRegistryPath: trustPath,
    });

    writeFileSync(
      govPath,
      `version: "1"
committee_id: ORGOS-JP-COMMITTEE
governance_requests: []
`,
      "utf-8"
    );

    setTenantId("acme");
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "company.yaml"),
      `name: Acme Co
corporate_number: "4010001199703"
public_disclosure:
  representative_email: ceo@acme.example
  internal_domains:
    - acme.example
`,
      "utf-8"
    );
    writeFileSync(
      join(getDataDir(), "protocol", "wire-gateway.yaml"),
      `node_id: acme-gov-node
node_uri: steward://tenant/acme
display_name: Acme Co
internal_api:
  base_url: https://wire.acme.example
`,
      "utf-8"
    );
    ensureProtocolSigningKey();

    expect(() =>
      submitWireNodeGovernanceRequest({
        tenantId: "acme",
        wireEmail: "wire-notices@acme.example",
        corporateNumber: "4010001199703",
        governancePath: govPath,
        trustRegistryPath: trustPath,
      })
    ).toThrow(/corporate_number/);
  });
});
