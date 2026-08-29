import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getInstallRoot, getWorkspaceRoot } from "../orgos-paths.js";
import { getClock } from "../runtime-context.js";

const attestationSchema = z.object({
  version: z.literal(1),
  status: z.enum(["pending", "signed"]),
  document_path: z.string(),
  signed_at: z.string().optional(),
  signed_by: z.string().optional(),
  note: z.string().optional(),
  counsel_reviewed: z.boolean().optional(),
  counsel_reviewed_at: z.string().optional(),
  counsel_reviewed_by: z.string().optional(),
});

export type LegalAttestationRecord = z.infer<typeof attestationSchema>;

function attestationPath(): string {
  return join(getWorkspaceRoot(), "product-fleet", "legal-attestation.yaml");
}

export function loadLegalAttestation(): LegalAttestationRecord {
  const path = attestationPath();
  if (!existsSync(path)) {
    return attestationSchema.parse({
      version: 1,
      status: "pending",
      document_path: "docs/product/legal/terms-of-service.md",
    });
  }
  return attestationSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function isLegalDocumentationSigned(): boolean {
  const record = loadLegalAttestation();
  if (record.status !== "signed") return false;
  const docPath = join(getInstallRoot(), record.document_path);
  if (!existsSync(docPath)) return false;
  const body = readFileSync(docPath, "utf-8");
  // Refuse "signed" when canonical text still says draft / counsel-pending
  if (/ドラフト|Counsel review pending|法務レビュー前/u.test(body)) {
    return false;
  }
  return true;
}

/** Honest product status for UI — pending while counsel review incomplete. */
function looksLikeCounselSigner(name: string | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return (
    n.startsWith("counsel-") ||
    n === "external-counsel" ||
    n === "counsel" ||
    n.includes("外部counsel") ||
    n.includes("external counsel")
  );
}

/** Commercial claim: signed + counsel review recorded (or counsel-* signer). */
export function isLegalDocumentationCounselSigned(): boolean {
  if (!isLegalDocumentationSigned()) return false;
  const record = loadLegalAttestation();
  if (record.counsel_reviewed === true && record.counsel_reviewed_by?.trim()) {
    return true;
  }
  return looksLikeCounselSigner(record.signed_by);
}


export function getLegalDocumentationStatus(): {
  status: "pending" | "signed";
  counsel_ready: boolean;
  counsel_signed: boolean;
  document_path: string;
  detail: string;
} {
  const record = loadLegalAttestation();
  const docPath = join(getInstallRoot(), record.document_path);
  const exists = existsSync(docPath);
  const body = exists ? readFileSync(docPath, "utf-8") : "";
  const draft =
    !exists || /ドラフト|Counsel review pending|法務レビュー前/u.test(body);
  const signed = isLegalDocumentationSigned();
  const counselSigned = isLegalDocumentationCounselSigned();
  return {
    status: signed ? "signed" : "pending",
    counsel_ready: !draft,
    counsel_signed: counselSigned,
    document_path: record.document_path,
    detail: counselSigned
      ? "counsel-signed"
      : signed
        ? "signed (counsel review pending)"
        : draft
          ? "法務レビュー待ち（ドラフト掲載中）"
          : "attestation pending",
  };
}

export function attestLegalDocumentation(input: {
  documentPath?: string;
  signedBy: string;
  note?: string;
  counselReviewed?: boolean;
  counselReviewedBy?: string;
  counselReviewedAt?: string;
}): LegalAttestationRecord {
  const documentPath =
    input.documentPath?.trim() || "docs/product/legal/terms-of-service.md";
  const docAbs = join(getInstallRoot(), documentPath);
  if (!existsSync(docAbs)) {
    throw new Error(`Legal document not found: ${documentPath}`);
  }
  const counselReviewedBy = input.counselReviewedBy?.trim();
  const counselReviewed =
    input.counselReviewed === true ||
    Boolean(counselReviewedBy) ||
    looksLikeCounselSigner(input.signedBy);
  const record = attestationSchema.parse({
    version: 1,
    status: "signed",
    document_path: documentPath,
    signed_at: getClock().now().toISOString(),
    signed_by: input.signedBy.trim(),
    note: input.note ?? "Counsel-reviewed ToS published",
    counsel_reviewed: counselReviewed || undefined,
    counsel_reviewed_by: counselReviewedBy || (counselReviewed ? input.signedBy.trim() : undefined),
    counsel_reviewed_at: counselReviewed
      ? (input.counselReviewedAt?.trim() || getClock().now().toISOString())
      : undefined,
  });
  mkdirSync(join(getWorkspaceRoot(), "product-fleet"), { recursive: true });
  writeFileSync(attestationPath(), YAML.stringify(record), "utf-8");
  return record;
}
