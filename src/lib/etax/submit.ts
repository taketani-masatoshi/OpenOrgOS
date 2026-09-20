import type { EtaxEnvironment } from "../../../schemas/etax/submission-state.js";
import type { EtaxTransportProviderId } from "../../../schemas/etax/transport.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { assertProductionSubmitAllowed } from "./production-gate.js";
import { transitionStatus } from "./state-machine.js";
import type { EtaxSubmissionRecord } from "./store.js";
import {
  createTransportAdapter,
  resolveTransportProviderId,
} from "./transport.js";
import type { ReceiptResult, SignedSubmission, SubmissionResult } from "./adapters.js";

export function markReadyToSubmit(
  sub: EtaxSubmissionRecord,
  env: EtaxEnvironment,
): EtaxSubmissionRecord {
  if (sub.status !== "SIGNED") {
    throw etaxError({
      code: "ETAX_READY_REQUIRES_SIGNED",
      field: "status",
      rule: `${sub.status}->READY_TO_SUBMIT`,
      message: `Ready-to-submit requires SIGNED. Current status is ${sub.status}`,
    });
  }
  if (!sub.signatureRef) {
    throw etaxError({
      code: "ETAX_READY_NO_SIGNATURE",
      field: "signatureRef",
      message: "Cannot mark ready without a bound signatureRef",
    });
  }
  if (env === "production" && sub.signatureProvider !== "official") {
    throw etaxError({
      code: "ETAX_READY_PRODUCTION_REQUIRES_OFFICIAL",
      blocked: "PRODUCTION_DISABLED",
      message: "Production ready-to-submit requires an official NTA signature",
    });
  }
  return {
    ...sub,
    status: transitionStatus(sub.status, "READY_TO_SUBMIT"),
    environment: env,
  };
}

export function replayIfAlreadySent(sub: EtaxSubmissionRecord): EtaxSubmissionRecord | undefined {
  if (sub.status === "SUBMITTED" && sub.requestId) return sub;
  if (sub.status === "RECEIVED_BY_ETAX") {
    throw etaxError({
      code: "ETAX_ALREADY_RECEIVED",
      blocked: "DUPLICATE_SUBMISSION",
      message: `Submission ${sub.id} is already RECEIVED_BY_ETAX; use etax receipt, do not resend`,
    });
  }
  return undefined;
}

export async function sendSignedSubmission(opts: {
  sub: EtaxSubmissionRecord;
  env: EtaxEnvironment;
  provider?: EtaxTransportProviderId;
  document: Buffer;
  signature: SignedSubmission["signature"];
}): Promise<{ submission: EtaxSubmissionRecord; result: SubmissionResult }> {
  if (opts.env === "production") {
    assertProductionSubmitAllowed("production");
  }
  const replay = replayIfAlreadySent(opts.sub);
  if (replay) {
    return {
      submission: replay,
      result: {
        ok: true,
        requestId: replay.requestId,
        transportStatus: "sent",
        message: "Idempotent replay of an already-sent mock/official requestId",
      },
    };
  }
  const from = opts.sub.status;
  if (from !== "READY_TO_SUBMIT" && from !== "TRANSPORT_ERROR") {
    throw etaxError({
      code: "ETAX_SUBMIT_NOT_READY",
      field: "status",
      rule: `${from}->SUBMITTED`,
      message: `Submit requires READY_TO_SUBMIT or TRANSPORT_ERROR retry. Current status is ${from}`,
    });
  }
  if (!opts.sub.xmlHash) {
    throw etaxError({
      code: "ETAX_SUBMIT_NO_XML",
      field: "xmlHash",
      blocked: "SPEC_BLOCKED",
      message: "Cannot submit without a bound xmlHash",
    });
  }
  const provider = resolveTransportProviderId(opts.env, opts.provider);
  const result = await createTransportAdapter(provider).submit({
    submissionId: opts.sub.id,
    xml: opts.document,
    xmlHash: opts.sub.xmlHash,
    signature: opts.signature,
  });
  const nextStatus =
    result.transportStatus === "sent"
      ? transitionStatus(from, "SUBMITTED")
      : from === "TRANSPORT_ERROR"
        ? "TRANSPORT_ERROR"
        : transitionStatus("READY_TO_SUBMIT", "TRANSPORT_ERROR");
  return {
    submission: {
      ...opts.sub,
      status: nextStatus,
      requestId: result.requestId,
      environment: opts.env,
    },
    result,
  };
}

export async function pullReceipt(opts: {
  sub: EtaxSubmissionRecord;
  env: EtaxEnvironment;
  provider?: EtaxTransportProviderId;
}): Promise<{ submission: EtaxSubmissionRecord; receipt: ReceiptResult }> {
  if (opts.sub.status === "RECEIVED_BY_ETAX" && opts.sub.receiptNumber) {
    return {
      submission: opts.sub,
      receipt: {
        submissionId: opts.sub.id,
        requestId: opts.sub.requestId,
        receiptNumber: opts.sub.receiptNumber,
        responseHash: opts.sub.receiptHash,
        status: "RECEIVED_BY_ETAX",
      },
    };
  }
  if (opts.sub.status !== "SUBMITTED") {
    throw etaxError({
      code: "ETAX_RECEIPT_NOT_SUBMITTED",
      field: "status",
      message: `Receipt requires SUBMITTED. Current status is ${opts.sub.status}`,
    });
  }
  if (opts.env === "production") {
    assertProductionSubmitAllowed("production");
  }
  const provider = resolveTransportProviderId(opts.env, opts.provider);
  const receipt = await createTransportAdapter(provider).getReceipt(opts.sub.id);
  const nextStatus =
    receipt.status === "RECEIVED_BY_ETAX" || receipt.status === "REJECTED_BY_ETAX"
      ? transitionStatus("SUBMITTED", receipt.status)
      : transitionStatus("SUBMITTED", "TRANSPORT_ERROR");
  return {
    submission: {
      ...opts.sub,
      status: nextStatus,
      requestId: receipt.requestId ?? opts.sub.requestId,
      receiptNumber: receipt.receiptNumber,
      receiptHash: receipt.responseHash,
    },
    receipt,
  };
}
