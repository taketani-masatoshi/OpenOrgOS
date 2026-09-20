import type { EtaxEnvironment } from "../../../schemas/etax/submission-state.js";
import type { EtaxSignatureProviderId, EtaxSignatureResult } from "../../../schemas/etax/signature.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import {
  createSignatureAdapter,
  resolveSignatureProviderId,
  type SignatureResult,
} from "./adapters.js";
import { sha256Digest } from "./hash.js";
import { assertProductionSubmitAllowed } from "./production-gate.js";
import { transitionStatus } from "./state-machine.js";
import type { EtaxSubmissionRecord } from "./store.js";

export async function signDocument(opts: {
  env: EtaxEnvironment;
  provider?: EtaxSignatureProviderId;
  document: Buffer;
  documentHash: string;
}): Promise<SignatureResult> {
  if (opts.env === "production") {
    assertProductionSubmitAllowed("production");
  }
  const id = resolveSignatureProviderId(opts.env, opts.provider);
  return createSignatureAdapter(id).sign({
    document: opts.document,
    documentHash: opts.documentHash,
  });
}

export function bindSignatureToSubmission(
  sub: EtaxSubmissionRecord,
  signature: EtaxSignatureResult,
  env: EtaxEnvironment,
): EtaxSubmissionRecord {
  if (sub.status !== "APPROVED") {
    throw etaxError({
      code: "ETAX_SIGN_REQUIRES_APPROVAL",
      field: "status",
      rule: `${sub.status}->SIGNED`,
      message: `Signature requires APPROVED (Phase 6). Current status is ${sub.status}`,
    });
  }
  if (!sub.xmlHash) {
    throw etaxError({
      code: "ETAX_SIGN_NO_XML",
      field: "xmlHash",
      blocked: "SPEC_BLOCKED",
      message: "Official XML is not bound (xmlHash missing). Cannot sign.",
    });
  }
  if (sub.xmlHash !== signature.documentHash) {
    throw etaxError({
      code: "ETAX_SIGNATURE_XML_HASH_MISMATCH",
      field: "xmlHash",
      blocked: "HASH_MISMATCH",
      message: "Signature documentHash does not match the submission xmlHash",
    });
  }
  if (signature.provider === "mock" && signature.legal !== false) {
    throw etaxError({
      code: "ETAX_MOCK_CLAIMED_LEGAL",
      blocked: "SPEC_BLOCKED",
      message: "Mock signature must set legal=false",
    });
  }
  if (env === "production" && signature.provider === "mock") {
    throw etaxError({
      code: "ETAX_MOCK_SIGNATURE_FORBIDDEN",
      blocked: "PRODUCTION_DISABLED",
      message: "Mock signatures cannot bind a production submission",
    });
  }
  return {
    ...sub,
    status: transitionStatus(sub.status, "SIGNED"),
    signatureRef: `${signature.provider}:${signature.signatureHash}`,
    signatureProvider: signature.provider,
    signatureLegal: signature.legal,
    signatureDocumentHash: signature.documentHash,
    signatureHash: signature.signatureHash,
    environment: env,
  };
}

export function xmlHashOf(document: Buffer): `sha256:${string}` {
  return sha256Digest(document);
}
