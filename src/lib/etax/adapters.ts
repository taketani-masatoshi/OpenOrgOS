import { etaxError } from "../../../schemas/etax/errors.js";
import {
  etaxSignatureResultSchema,
  type EtaxSignatureProviderId,
  type EtaxSignatureResult,
} from "../../../schemas/etax/signature.js";
import type { EtaxEnvironment } from "../../../schemas/etax/submission-state.js";
import { getClock } from "../runtime-context.js";
import { sha256Digest } from "./hash.js";
import { loadSignatureCatalog } from "./signature-catalog.js";
import { ETAX_PRODUCTION_BANNER } from "./constants.js";

export type SignatureResult = EtaxSignatureResult;

export interface SignatureProvider {
  readonly id: EtaxSignatureProviderId;
  sign(input: { document: Buffer; documentHash: string }): Promise<SignatureResult>;
}

const MOCK_CERTIFICATE_ID = "orgos-mock-not-an-nta-certificate";
const MOCK_NOT_LEGAL =
  "Labeled mock digest only. Not NTA CLXtxSigner SignToReport. Not a legal e-Tax signature.";

export function assertDocumentHash(document: Buffer, documentHash: string): void {
  const live = sha256Digest(document);
  if (live !== documentHash) {
    throw etaxError({
      code: "ETAX_SIGNATURE_HASH_MISMATCH",
      field: "documentHash",
      blocked: "HASH_MISMATCH",
      message: "Document bytes do not match the bound documentHash",
    });
  }
}

export function resolveSignatureProviderId(
  env: EtaxEnvironment,
  requested?: EtaxSignatureProviderId,
): EtaxSignatureProviderId {
  const want: EtaxSignatureProviderId = requested ?? (env === "mock" ? "mock" : "official");
  if (want === "mock" && env !== "mock") {
    throw etaxError({
      code: "ETAX_MOCK_SIGNATURE_FORBIDDEN",
      blocked: env === "production" ? "PRODUCTION_DISABLED" : "SPEC_BLOCKED",
      message:
        env === "production"
          ? `${ETAX_PRODUCTION_BANNER}: mock signatures are not legal e-Tax signatures`
          : "Mock signatures are forbidden outside --env mock (test/production require the official NTA module)",
    });
  }
  return want;
}

export function createSignatureAdapter(id: EtaxSignatureProviderId): SignatureProvider {
  if (id === "mock") return new MockSignatureAdapter();
  return new EtaxOfficialSignatureAdapter();
}

export class MockSignatureAdapter implements SignatureProvider {
  readonly id = "mock" as const;

  async sign(input: { document: Buffer; documentHash: string }): Promise<SignatureResult> {
    assertDocumentHash(input.document, input.documentHash);
    return etaxSignatureResultSchema.parse({
      provider: "mock",
      legal: false,
      certificateId: MOCK_CERTIFICATE_ID,
      certificateValid: false,
      signingTime: getClock().now().toISOString(),
      documentHash: input.documentHash,
      signatureHash: sha256Digest(`ORGOS-ETAX-MOCK-NOT-LEGAL|${input.documentHash}`),
      method: "mock-labeled-digest",
      notLegalReason: MOCK_NOT_LEGAL,
    });
  }
}

export class EtaxOfficialSignatureAdapter implements SignatureProvider {
  readonly id = "official" as const;

  async sign(input: { document: Buffer; documentHash: string }): Promise<SignatureResult> {
    assertDocumentHash(input.document, input.documentHash);
    const catalog = loadSignatureCatalog();
    const platform = process.platform === "win32" ? "windows" : "cocoa";
    const surface =
      platform === "windows"
        ? `COM ${catalog.windows.progid} ${catalog.windows.reportMethod} (${catalog.windows.dll})`
        : `Cocoa ${catalog.cocoa.interface}.${catalog.cocoa.reportMethod} (${catalog.cocoa.framework})`;

    if (!catalog.hostBound) {
      throw etaxError({
        code: "ETAX_OFFICIAL_SIGNATURE_HOST_UNBOUND",
        blocked: "SPEC_BLOCKED",
        specVersion: catalog.specArtifactId,
        message:
          `Official NTA signature host is not bound (hostBound=${catalog.hostBound}). ` +
          `Catalogued call is ${surface}. ` +
          "Refusing to invent a CLI, FFI, or homegrown XML-DSig. PIN/password stay on the NTA module / device.",
      });
    }

    const { getEtaxHostClient } = await import("./host-client.js");
    const host = getEtaxHostClient();
    const health = await host.health();
    if (!health.ok || !health.signatureBound) {
      throw etaxError({
        code: "ETAX_OFFICIAL_SIGNATURE_HOST_UNHEALTHY",
        blocked: "SPEC_BLOCKED",
        specVersion: catalog.specArtifactId,
        message:
          `hostBound=true but etax-host signature is unbound (${health.detail ?? "no detail"}). ` +
          `Catalogued call is ${surface}.`,
      });
    }
    const signed = await host.signToReport({
      document: input.document,
      documentHash: input.documentHash,
    });
    return etaxSignatureResultSchema.parse({
      provider: "official",
      legal: true,
      certificateId: signed.certificateId,
      certificateValid: signed.certificateValid,
      signingTime: signed.signingTime,
      documentHash: input.documentHash,
      signatureHash: signed.signatureHash,
      moduleId: signed.moduleId,
      method: signed.method ?? catalog.windows.reportMethod,
    });
  }
}

export interface SignedSubmission {
  submissionId: string;
  xml: Buffer;
  xmlHash: string;
  signature: SignatureResult;
}

export interface SubmissionResult {
  ok: boolean;
  requestId?: string;
  transportStatus: "sent" | "rejected" | "error" | "blocked";
  message: string;
}

export interface ReceiptResult {
  submissionId: string;
  requestId?: string;
  receiptNumber?: string;
  submittedAt?: string;
  receivedAt?: string;
  status: "RECEIVED_BY_ETAX" | "REJECTED_BY_ETAX" | "TRANSPORT_ERROR" | "UNKNOWN";
  errorCode?: string;
  errorMessage?: string;
  responseHash?: string;
  sourceXmlHash?: string;
}

export interface EtaxTransport {
  submit(request: SignedSubmission): Promise<SubmissionResult>;
  getReceipt(id: string): Promise<ReceiptResult>;
}

export {
  MockEtaxTransport,
  EtaxOfficialTransport,
  createTransportAdapter,
  resolveTransportProviderId,
} from "./transport.js";

