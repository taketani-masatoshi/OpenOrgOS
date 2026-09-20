import { etaxError } from "../../../schemas/etax/errors.js";

export interface SignatureResult {
  certificateId: string;
  certificateValid: boolean;
  signingTime: string;
  documentHash: string;
  signatureHash: string;
  provider: "official" | "mock";
}

export interface SignatureProvider {
  readonly id: "official" | "mock";
  sign(input: { document: Buffer; documentHash: string }): Promise<SignatureResult>;
}

export class MockSignatureAdapter implements SignatureProvider {
  readonly id = "mock" as const;

  async sign(): Promise<SignatureResult> {
    throw etaxError({
      code: "ETAX_SIGNATURE_PHASE_BLOCKED",
      blocked: "PHASE_NOT_IMPLEMENTED",
      message:
        "Electronic signature adapter is Phase 3. Mock must not be treated as a legal e-Tax signature.",
    });
  }
}

export class EtaxOfficialSignatureAdapter implements SignatureProvider {
  readonly id = "official" as const;

  async sign(): Promise<SignatureResult> {
    throw etaxError({
      code: "ETAX_OFFICIAL_SIGNATURE_SPEC_BLOCKED",
      blocked: "SPEC_BLOCKED",
      message:
        "Official NTA signature module interface is not yet bound (KSK2 e-tax05 CAB not unpacked into an adapter).",
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

export class MockEtaxTransport implements EtaxTransport {
  async submit(): Promise<SubmissionResult> {
    throw etaxError({
      code: "ETAX_TRANSPORT_PHASE_BLOCKED",
      blocked: "PHASE_NOT_IMPLEMENTED",
      message: "Transport adapter is Phase 4. Mock transport is not NTA transmission.",
    });
  }

  async getReceipt(): Promise<ReceiptResult> {
    throw etaxError({
      code: "ETAX_RECEIPT_PHASE_BLOCKED",
      blocked: "PHASE_NOT_IMPLEMENTED",
      message: "Receipt adapter is Phase 5.",
    });
  }
}
