import { etaxError } from "../../../schemas/etax/errors.js";
import type { EtaxTransportProviderId } from "../../../schemas/etax/transport.js";
import type { EtaxEnvironment } from "../../../schemas/etax/submission-state.js";
import { getClock } from "../runtime-context.js";
import { sha256Digest, sha256Hex } from "./hash.js";
import { loadTransportCatalog } from "./transport-catalog.js";
import { ETAX_PRODUCTION_BANNER } from "./constants.js";
import type {
  EtaxTransport,
  ReceiptResult,
  SignedSubmission,
  SubmissionResult,
} from "./adapters.js";

export function resolveTransportProviderId(
  env: EtaxEnvironment,
  requested?: EtaxTransportProviderId,
): EtaxTransportProviderId {
  const want: EtaxTransportProviderId = requested ?? (env === "mock" ? "mock" : "official");
  if (want === "mock" && env !== "mock") {
    throw etaxError({
      code: "ETAX_MOCK_TRANSPORT_FORBIDDEN",
      blocked: env === "production" ? "PRODUCTION_DISABLED" : "SPEC_BLOCKED",
      message:
        env === "production"
          ? `${ETAX_PRODUCTION_BANNER}: mock transport is not NTA transmission`
          : "Mock transport is forbidden outside --env mock (test/production require the official NTA module)",
    });
  }
  return want;
}

export function createTransportAdapter(id: EtaxTransportProviderId): EtaxTransport {
  if (id === "mock") return new MockEtaxTransport();
  return new EtaxOfficialTransport();
}

export class MockEtaxTransport implements EtaxTransport {
  async submit(request: SignedSubmission): Promise<SubmissionResult> {
    if (request.signature.provider === "official" && request.signature.legal) {
      throw etaxError({
        code: "ETAX_MOCK_TRANSPORT_OFFICIAL_SIGNATURE",
        blocked: "SPEC_BLOCKED",
        message: "Mock transport cannot carry an official NTA signature",
      });
    }
    const requestId = `mock:${sha256Hex(`ORGOS-ETAX-MOCK-REQUEST|${request.submissionId}`).slice(0, 32)}`;
    return {
      ok: true,
      requestId,
      transportStatus: "sent",
      message:
        "Mock transport only. Not NTA transmission. Not a legal e-Tax filing.",
    };
  }

  async getReceipt(id: string): Promise<ReceiptResult> {
    const receivedAt = getClock().now().toISOString();
    return {
      submissionId: id,
      requestId: `mock:${sha256Hex(`ORGOS-ETAX-MOCK-REQUEST|${id}`).slice(0, 32)}`,
      receiptNumber: `MOCK-NOT-NTA-${sha256Hex(id).slice(0, 12)}`,
      receivedAt,
      status: "RECEIVED_BY_ETAX",
      responseHash: sha256Digest(`ORGOS-ETAX-MOCK-RECEIPT|${id}`),
    };
  }
}

export class EtaxOfficialTransport implements EtaxTransport {
  async submit(request: SignedSubmission): Promise<SubmissionResult> {
    const catalog = loadTransportCatalog();
    if (!catalog.hostBound) {
      throw etaxError({
        code: "ETAX_OFFICIAL_TRANSPORT_HOST_UNBOUND",
        blocked: "SPEC_BLOCKED",
        specVersion: catalog.specArtifactId,
        message:
          `Official NTA send/receive host is not bound (hostBound=${catalog.hostBound}). ` +
          `Catalogued call is COM ${catalog.windows.progid}.${catalog.windows.submitMethod} (${catalog.windows.dll}). ` +
          "Refusing to invent HTTP endpoints, request IDs, or a CLI.",
      });
    }
    const { getEtaxHostClient } = await import("./host-client.js");
    const host = getEtaxHostClient();
    const health = await host.health();
    if (!health.ok || !health.transportBound) {
      throw etaxError({
        code: "ETAX_OFFICIAL_TRANSPORT_HOST_UNHEALTHY",
        blocked: "SPEC_BLOCKED",
        specVersion: catalog.specArtifactId,
        message: `hostBound=true but etax-host transport unbound (${health.detail ?? "no detail"})`,
      });
    }
    const result = await host.send({
      submissionId: request.submissionId,
      document: request.xml,
      documentHash: request.xmlHash,
      signatureHash: request.signature.signatureHash,
    });
    return {
      ok: result.ok,
      requestId: result.requestId,
      transportStatus: result.transportStatus,
      message: result.message,
    };
  }

  async getReceipt(id: string): Promise<ReceiptResult> {
    const catalog = loadTransportCatalog();
    if (!catalog.hostBound) {
      throw etaxError({
        code: "ETAX_OFFICIAL_RECEIPT_HOST_UNBOUND",
        blocked: "SPEC_BLOCKED",
        specVersion: catalog.specArtifactId,
        message:
          `Official NTA receipt host is not bound (hostBound=${catalog.hostBound}). ` +
          `Catalogued call is COM ${catalog.windows.progid}.${catalog.windows.receiptMethod}. ` +
          "Refusing to invent 受付番号 parsing without host + e-tax18 map.",
      });
    }
    const { getEtaxHostClient } = await import("./host-client.js");
    const { parseReceiptXml } = await import("./receipt-mapping.js");
    const { assertOfficialReceiptNumberNotMock } = await import("./receipt-policy.js");
    const host = getEtaxHostClient();
    const health = await host.health();
    if (!health.ok || !health.transportBound) {
      throw etaxError({
        code: "ETAX_OFFICIAL_RECEIPT_HOST_UNHEALTHY",
        blocked: "SPEC_BLOCKED",
        specVersion: catalog.specArtifactId,
        message: `hostBound=true but etax-host transport unbound (${health.detail ?? "no detail"})`,
      });
    }
    const raw = await host.getResponse({ submissionId: id });
    let receiptNumber = raw.receiptNumber;
    if (!receiptNumber && raw.receiptXml) {
      const parsed = parseReceiptXml(raw.receiptXml);
      receiptNumber = parsed.receiptNumber;
    }
    assertOfficialReceiptNumberNotMock(receiptNumber);
    return {
      submissionId: id,
      requestId: raw.requestId,
      receiptNumber,
      receivedAt: raw.receivedAt,
      status:
        raw.status === "REJECTED_BY_ETAX"
          ? "REJECTED_BY_ETAX"
          : raw.status === "PENDING"
            ? "UNKNOWN"
            : "RECEIVED_BY_ETAX",
      responseHash: raw.responseHash,
    };
  }
}
