import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { PdfEsignCase } from "../../../../schemas/pdf-esign.js";
import { getPdfEsignDataDir } from "../paths.js";
import type {
  PdfEsignAdapter,
  PdfEsignCancelResult,
  PdfEsignCreateResult,
  PdfEsignDownloadResult,
  PdfEsignStatusResult,
} from "../adapter.js";

/**
 * Estonian DigiDoc / open-eid path (ADR 0014).
 * Humans sign with DigiDoc4 + national card. OrgOS records containers; SiVa validates later.
 */
export const digidocPdfEsignAdapter: PdfEsignAdapter = {
  providerId: "digidoc",
  async createEnvelope(c: PdfEsignCase): Promise<PdfEsignCreateResult> {
    const workDir = c.work_dir ?? join(getPdfEsignDataDir(), "work", c.id);
    mkdirSync(workDir, { recursive: true });
    const destPdf = join(workDir, basename(c.pdf_path));
    if (existsSync(c.pdf_path) && !existsSync(destPdf)) {
      copyFileSync(c.pdf_path, destPdf);
    }
    return {
      ok: true,
      external_ref: `digidoc-${c.id}`,
      message:
        `National eID DigiDoc: open ${destPdf} (or folder ${workDir}) in DigiDoc4, ` +
        `sign with EE digi-ID / e-Residency card, save .asice, then ` +
        `operations esign attach-container --id ${c.id} --asice PATH`,
    };
  },
  async getStatus(c: PdfEsignCase): Promise<PdfEsignStatusResult> {
    if (c.container_path && existsSync(c.container_path)) {
      if (
        c.status === "completed" &&
        c.siva_mode === "live" &&
        c.siva_indication === "TOTAL-PASSED"
      ) {
        return {
          ok: true,
          status: "completed",
          message: "National SiVa TOTAL-PASSED recorded",
        };
      }
      if (c.status === "failed") {
        return {
          ok: true,
          status: "failed",
          message: c.siva_reason ?? c.siva_indication ?? "verification failed",
        };
      }
      return {
        ok: true,
        status: "partially_signed",
        message:
          c.siva_mode === "mock"
            ? "Mock SiVa only — run live verify-digidoc for national completion"
            : "Container present — run verify-digidoc (live SiVa)",
      };
    }
    if (c.status === "sent") {
      return {
        ok: true,
        status: "pending",
        message: "Awaiting DigiDoc4 signature and attach-container",
      };
    }
    return { ok: true, status: "unknown", message: `status=${c.status}` };
  },
  async downloadSignedPdf(c: PdfEsignCase): Promise<PdfEsignDownloadResult> {
    if (c.container_path) {
      return {
        ok: true,
        signed_pdf_path: c.container_path,
        message: "ASiC-E container path (not bare PDF)",
      };
    }
    return { ok: false, message: "No container_path" };
  },
  async cancel(_c: PdfEsignCase): Promise<PdfEsignCancelResult> {
    return { ok: true, message: "Cancelled locally (DigiDoc human path)" };
  },
};
