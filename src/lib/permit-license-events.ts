/**
 * 行許可ライフサイクル → company-events（kind: compliance）。
 * ADR 0012 標準イベント名を notes / slug に載せる。
 */
import { createCompanyEvent, type CreateCompanyEventOptions } from "./company-events.js";
import type { CompanyEvent } from "../../schemas/company-events.js";

export type LicenseLifecycleEvent =
  | "LicenseApplicationStarted"
  | "DocumentUploaded"
  | "ApplicationSubmitted"
  | "CorrectionRequested"
  | "LicenseGranted"
  | "LicenseRenewed"
  | "LicenseModified"
  | "LicenseExpired"
  | "LicenseRevoked"
  | "LicenseClosed";

export interface EmitLicenseLifecycleOptions {
  lifecycle: LicenseLifecycleEvent;
  applicationId: string;
  permitTypeId: string;
  permitId?: string;
  propertyId?: string;
  phase?: string;
  title?: string;
  notes?: string;
  /** dry-run: do not write */
  skipWrite?: boolean;
}

const SLUG: Record<LicenseLifecycleEvent, string> = {
  LicenseApplicationStarted: "license-application-started",
  DocumentUploaded: "license-document-uploaded",
  ApplicationSubmitted: "license-application-submitted",
  CorrectionRequested: "license-correction-requested",
  LicenseGranted: "license-granted",
  LicenseRenewed: "license-renewed",
  LicenseModified: "license-modified",
  LicenseExpired: "license-expired",
  LicenseRevoked: "license-revoked",
  LicenseClosed: "license-closed",
};

export function emitLicenseLifecycleEvent(
  opts: EmitLicenseLifecycleOptions
): CompanyEvent | null {
  if (opts.skipWrite) return null;

  const title =
    opts.title ??
    `${opts.lifecycle}: ${opts.permitTypeId} (${opts.applicationId})`;

  const createOpts: CreateCompanyEventOptions = {
    kind: "compliance",
    title,
    slug: `${SLUG[opts.lifecycle]}-${opts.applicationId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(
      0,
      48
    ),
    related: {
      application_id: opts.applicationId,
      permit_type_id: opts.permitTypeId,
      permit_id: opts.permitId,
      property_id: opts.propertyId,
      license_lifecycle: opts.lifecycle,
      phase: opts.phase,
    },
    notes:
      opts.notes ??
      `OpenOrgOS license lifecycle event ${opts.lifecycle} · ADR 0012`,
  };

  try {
    return createCompanyEvent(createOpts);
  } catch (e) {
    // イベント失敗で許可承認自体をロールバックしない（ログ相当）
    console.error(
      `⚠ license lifecycle event failed (${opts.lifecycle}): ${
        e instanceof Error ? e.message : String(e)
      }`
    );
    return null;
  }
}
