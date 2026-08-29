/**
 * PDF e-sign provider adapter contract.
 * Path: src/lib/pdf-esign/adapter.ts
 *
 * Providers never hold PINs or private keys — humans sign on their own device
 * with a national eID card (ADR 0014). Adapters only move containers and status.
 */
import type { PdfEsignCase, PdfEsignStatus } from "../../../schemas/pdf-esign.js";

export type PdfEsignCreateResult = {
  ok: boolean;
  external_ref?: string;
  deep_link_url?: string;
  message?: string;
};

/** `pending` covers "sent, waiting on the human signer"; `unknown` is a fallback. */
export type PdfEsignAdapterStatus = PdfEsignStatus | "pending" | "unknown";

export type PdfEsignStatusResult = {
  ok: boolean;
  status: PdfEsignAdapterStatus;
  message?: string;
};

export type PdfEsignDownloadResult = {
  ok: boolean;
  signed_pdf_path?: string;
  message?: string;
};

export type PdfEsignCancelResult = {
  ok: boolean;
  message?: string;
};

export interface PdfEsignAdapter {
  providerId: string;
  createEnvelope(c: PdfEsignCase): Promise<PdfEsignCreateResult>;
  getStatus(c: PdfEsignCase): Promise<PdfEsignStatusResult>;
  downloadSignedPdf(c: PdfEsignCase): Promise<PdfEsignDownloadResult>;
  cancel(c: PdfEsignCase): Promise<PdfEsignCancelResult>;
}
