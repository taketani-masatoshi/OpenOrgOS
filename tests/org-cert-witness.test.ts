import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  organizationCertificateSpkiSha256,
  isOrganizationCertificateWitnessAnchored,
  saveOrganizationCertificateAttestation,
  signOrganizationCertificateAttestation,
  verifyOrganizationCertificateAttestation,
} from "../src/lib/protocol/org-cert-witness.js";
import {
  ensureWitnessTrustAuthorityKey,
  initWitnessTrustAuthority,
  publishWitnessTrustBundle,
} from "../src/lib/protocol/witness-trust.js";
import { generateHubKeyPair } from "../src/lib/hub/signing.js";
import {
  deriveOpenOrgDidFromPublicKey,
  type OpenOrgDid,
} from "../schemas/protocol/openorg-did.js";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";
import { buildWireNodeIdentityFields } from "../src/lib/wire-gateway/did.js";
import type { WireGatewayConfig } from "../schemas/protocol/wire-gateway-config.js";

const TEST_TENANT = `test-org-cert-${process.pid}-${randomUUID().slice(0, 8)}`;

function removeTestTenant(): void {
  if (!/^test-org-cert-\d+-[a-f0-9]{8}$/.test(TEST_TENANT)) {
    throw new Error(`Refusing to remove non-test tenant: ${TEST_TENANT}`);
  }
  const tenantsDir = resolve(getTenantsDir());
  const tenantDir = resolve(tenantsDir, TEST_TENANT);
  if (dirname(tenantDir) !== tenantsDir) {
    throw new Error(`Refusing to remove tenant outside test root: ${tenantDir}`);
  }
  rmSync(tenantDir, { recursive: true, force: true });
}

describe("org cert witness attestation", () => {
  let authority: ReturnType<typeof generateHubKeyPair>;
  let orgPublicKey: string;
  let orgDid: OpenOrgDid;

  beforeEach(() => {
    const tenantDir = join(getTenantsDir(), TEST_TENANT);
    removeTestTenant();
    mkdirSync(tenantDir, { recursive: true });
    writeFileSync(
      join(tenantDir, "tenant.yaml"),
      `id: ${TEST_TENANT}\nname: Org certificate witness test\nlifecycle: test\n`,
      "utf-8"
    );
    setTenantId(TEST_TENANT);
    authority = generateHubKeyPair();
    orgPublicKey = generateHubKeyPair().publicKey;
    orgDid = deriveOpenOrgDidFromPublicKey(orgPublicKey);
  });

  afterEach(() => {
    setTenantId("demo");
    removeTestTenant();
  });

  function signedAttestation(opts?: {
    authorityId?: string;
    issuedAt?: string;
    expiresAt?: string;
  }) {
    return signOrganizationCertificateAttestation(
      {
        version: "1",
        org_did: orgDid,
        spki_sha256: organizationCertificateSpkiSha256(orgPublicKey)!,
        authority_id: opts?.authorityId ?? "WTA-TEST",
        issued_at: opts?.issuedAt ?? "2026-07-11T00:00:00.000Z",
        expires_at: opts?.expiresAt ?? "2027-07-11T00:00:00.000Z",
      },
      authority.privateKeyPem
    );
  }

  it("computes SPKI sha256 fingerprint", () => {
    const hash = organizationCertificateSpkiSha256(orgPublicKey);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verifies a canonical attestation from a trusted authority", () => {
    const result = verifyOrganizationCertificateAttestation(signedAttestation(), {
      authorities: [{ authority_id: "WTA-TEST", public_key: authority.publicKey }],
      now: new Date("2026-07-12T00:00:00.000Z"),
    });
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("rejects tampering after signature", () => {
    const attestation = signedAttestation();
    const tampered = {
      ...attestation,
      spki_sha256: "0".repeat(64),
    };
    expect(
      verifyOrganizationCertificateAttestation(tampered, {
        authorities: [{ authority_id: "WTA-TEST", public_key: authority.publicKey }],
        now: new Date("2026-07-12T00:00:00.000Z"),
      })
    ).toMatchObject({ ok: false, issues: ["invalid authority_signature"] });
  });

  it("rejects expired attestations", () => {
    const attestation = signedAttestation({
      issuedAt: "2025-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    expect(
      verifyOrganizationCertificateAttestation(attestation, {
        authorities: [{ authority_id: "WTA-TEST", public_key: authority.publicKey }],
        now: new Date("2026-07-12T00:00:00.000Z"),
      }).issues
    ).toContain("attestation expired");
  });

  it("rejects attestations from an unknown authority", () => {
    expect(
      verifyOrganizationCertificateAttestation(signedAttestation(), {
        authorities: [],
        now: new Date("2026-07-12T00:00:00.000Z"),
      }).issues
    ).toContain("unknown authority: WTA-TEST");
  });

  it("publishes only a hash anchored by the compatible witness trust bundle", () => {
    expect(isOrganizationCertificateWitnessAnchored(orgPublicKey, orgDid)).toBe(false);

    initWitnessTrustAuthority({
      authorityId: "WTA-LOCAL",
      orgName: "Local Witness Authority",
      jurisdiction: "JP",
    });
    publishWitnessTrustBundle();
    const authorityKey = ensureWitnessTrustAuthorityKey();
    saveOrganizationCertificateAttestation(
      signOrganizationCertificateAttestation(
        {
          version: "1",
          org_did: orgDid,
          spki_sha256: organizationCertificateSpkiSha256(orgPublicKey)!,
          authority_id: "WTA-LOCAL",
          issued_at: "2026-07-11T00:00:00.000Z",
          expires_at: "2099-07-11T00:00:00.000Z",
        },
        authorityKey
      )
    );

    const config = {
      wire_version: "0.1",
      node_id: TEST_TENANT,
      did: orgDid,
    } as WireGatewayConfig;
    const identity = buildWireNodeIdentityFields(config, orgPublicKey);
    expect(identity.organization_certificate_spki_sha256).toBe(
      organizationCertificateSpkiSha256(orgPublicKey)
    );

    const unanchoredIdentity = buildWireNodeIdentityFields(
      config,
      generateHubKeyPair().publicKey
    );
    expect(unanchoredIdentity.organization_certificate_spki_sha256).toBeUndefined();
  });
});
