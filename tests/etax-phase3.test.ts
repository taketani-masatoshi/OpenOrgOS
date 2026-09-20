import { describe, expect, it } from "vitest";
import { EtaxException } from "../schemas/etax/errors.js";
import { sha256Digest } from "../src/lib/etax/hash.js";
import { redactEtaxRecord } from "../src/lib/etax/redact.js";
import {
  EtaxOfficialSignatureAdapter,
  MockSignatureAdapter,
  resolveSignatureProviderId,
} from "../src/lib/etax/adapters.js";
import {
  bindSignatureToSubmission,
  signDocument,
} from "../src/lib/etax/signature.js";
import { loadSignatureCatalog, officialSignatureHostBound } from "../src/lib/etax/signature-catalog.js";
import type { EtaxSubmissionRecord } from "../src/lib/etax/store.js";

const xml = Buffer.from(`<?xml version="1.0"?><data>mock-not-nta</data>`, "utf-8");
const xmlHash = sha256Digest(xml);

function approvedSubmission(overrides?: Partial<EtaxSubmissionRecord>): EtaxSubmissionRecord {
  return {
    id: "ETAX-SUB-phase3",
    packageId: "ETAX-PKG-phase3",
    status: "APPROVED",
    contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    xmlHash,
    identityKey: "identity",
    specVersion: "KSK2-2026-08-28",
    ...overrides,
  };
}

describe("etax signature catalog (e-tax05)", () => {
  it("catalogues official SignToReport and leaves the native host unbound", () => {
    const catalog = loadSignatureCatalog();
    expect(catalog.specArtifactId).toBe("e-tax05");
    expect(catalog.hostBound).toBe(false);
    expect(officialSignatureHostBound(catalog)).toBe(false);
    expect(catalog.windows.progid).toBe("nta.CLCXtxSigner");
    expect(catalog.windows.clsid).toBe("{AA8655A7-73CC-4567-8263-4BFAAACC0A24}");
    expect(catalog.windows.reportMethod).toBe("SignToReport");
    expect(catalog.windows.methods).toContain("SignToReport");
    expect(catalog.cocoa.reportMethod).toBe("SignToReport");
    expect(catalog.cocoa.methods).toContain("SetCertificateP12");
  });
});

describe("etax mock signature adapter", () => {
  it("binds a labeled mock digest to documentHash and never claims to be legal", async () => {
    const result = await new MockSignatureAdapter().sign({ document: xml, documentHash: xmlHash });
    expect(result.provider).toBe("mock");
    expect(result.legal).toBe(false);
    expect(result.certificateValid).toBe(false);
    expect(result.documentHash).toBe(xmlHash);
    expect(result.signatureHash.startsWith("sha256:")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/pin|password|BEGIN /i);
  });

  it("rejects a documentHash that does not match the bytes", async () => {
    await expect(
      new MockSignatureAdapter().sign({
        document: xml,
        documentHash: sha256Digest(Buffer.from("other")),
      })
    ).rejects.toMatchObject({ etax: { blocked: "HASH_MISMATCH" } });
  });
});

describe("etax official signature adapter", () => {
  it("refuses to invent a CLI or XML-DSig when the NTA host is unbound", async () => {
    try {
      await new EtaxOfficialSignatureAdapter().sign({ document: xml, documentHash: xmlHash });
      throw new Error("expected SPEC_BLOCKED");
    } catch (error) {
      expect(error).toBeInstanceOf(EtaxException);
      const etax = (error as EtaxException).etax;
      expect(etax.blocked).toBe("SPEC_BLOCKED");
      expect(etax.code).toBe("ETAX_OFFICIAL_SIGNATURE_HOST_UNBOUND");
      expect(etax.message).toMatch(/SignToReport/);
      expect(etax.message).toMatch(/nta\.CLCXtxSigner|CLISignature/);
      expect(etax.message).not.toMatch(/openssl cms/i);
    }
  });
});

describe("etax signature provider selection", () => {
  it("defaults mock env to mock and other envs to official", () => {
    expect(resolveSignatureProviderId("mock")).toBe("mock");
    expect(resolveSignatureProviderId("test")).toBe("official");
    expect(resolveSignatureProviderId("production")).toBe("official");
  });

  it("forbids mock signatures outside --env mock", () => {
    expect(() => resolveSignatureProviderId("test", "mock")).toThrow(EtaxException);
    try {
      resolveSignatureProviderId("production", "mock");
    } catch (error) {
      expect((error as EtaxException).etax.blocked).toBe("PRODUCTION_DISABLED");
    }
  });

  it("keeps production signDocument fail-closed", async () => {
    await expect(
      signDocument({ env: "production", document: xml, documentHash: xmlHash })
    ).rejects.toMatchObject({ etax: { blocked: "PRODUCTION_DISABLED" } });
  });
});

describe("etax signature binding", () => {
  it("moves APPROVED → SIGNED when xmlHash matches", async () => {
    const signature = await new MockSignatureAdapter().sign({ document: xml, documentHash: xmlHash });
    const next = bindSignatureToSubmission(approvedSubmission(), signature, "mock");
    expect(next.status).toBe("SIGNED");
    expect(next.signatureProvider).toBe("mock");
    expect(next.signatureRef).toBe(`mock:${signature.signatureHash}`);
  });

  it("refuses to sign without approval or without bound XML", async () => {
    const signature = await new MockSignatureAdapter().sign({ document: xml, documentHash: xmlHash });
    expect(() =>
      bindSignatureToSubmission(approvedSubmission({ status: "DRAFT" }), signature, "mock")
    ).toThrow(/APPROVED/);
    expect(() =>
      bindSignatureToSubmission(approvedSubmission({ xmlHash: undefined }), signature, "mock")
    ).toThrow(EtaxException);
  });

  it("invalidates a signature whose documentHash is not the xmlHash", async () => {
    const signature = await new MockSignatureAdapter().sign({ document: xml, documentHash: xmlHash });
    expect(() =>
      bindSignatureToSubmission(
        approvedSubmission({
          xmlHash: sha256Digest(Buffer.from("stale")),
        }),
        signature,
        "mock"
      )
    ).toThrow(EtaxException);
  });
});

describe("etax signature audit redaction", () => {
  it("does not keep PIN or password fields", () => {
    const redacted = redactEtaxRecord({
      action: "ETAX_SIGNATURE_CREATED",
      pin: "9999",
      password: "should-not-log",
      signatureRef: "mock:sha256:ab",
    });
    expect(JSON.stringify(redacted)).not.toContain("9999");
    expect(JSON.stringify(redacted)).not.toContain("should-not-log");
    expect(redacted.signatureRef).toBe("mock:sha256:ab");
  });
});
