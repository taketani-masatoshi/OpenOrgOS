/**
 * Propose / apply / revert org approvals for medical-device QMS/GVP gates.
 * Final approve remains human-only via org approval approve.
 *
 * gvp_report approval = authorize / confirm readiness to file — does NOT set
 * report_filed_on. Human filing fact: `ae mark-filed --on`.
 */
import {
  MEDICAL_DEVICE_APPROVAL_SUBJECTS,
  type MedicalDeviceApprovalSubject,
  type MedicalDeviceLedgerType,
} from "../../../schemas/jp-medical-device.js";
import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import { proposeOrgApproval } from "../org/approval/propose.js";
import { currentDate } from "../utils.js";
import { appendMedicalDeviceAudit } from "./audit.js";
import { findLedgerByType, loadLedgerEntries, updateLedgerEntry } from "./ledger-ops.js";

export { MEDICAL_DEVICE_APPROVAL_SUBJECTS };

type ApplyPatch = Record<string, unknown>;

function applyPatchFor(
  subject: MedicalDeviceApprovalSubject
): { type: MedicalDeviceLedgerType; patch: ApplyPatch; op: string } {
  switch (subject) {
    case MEDICAL_DEVICE_APPROVAL_SUBJECTS.capaClose:
      return { type: "capa", patch: { status: "closed" }, op: "approval.apply.capa_close" };
    case MEDICAL_DEVICE_APPROVAL_SUBJECTS.changeImplement:
      return {
        type: "change_control",
        patch: { status: "closed" },
        op: "approval.apply.change_implement",
      };
    case MEDICAL_DEVICE_APPROVAL_SUBJECTS.docRevision:
      return {
        type: "document_control",
        patch: { status: "approved", effective_on: currentDate() },
        op: "approval.apply.doc_revision",
      };
    case MEDICAL_DEVICE_APPROVAL_SUBJECTS.gvpReport:
      return {
        type: "adverse_event",
        patch: { status: "in_progress" },
        op: "approval.apply.gvp_report",
      };
  }
}

const DEFAULT_REVERT_STATUS: Record<MedicalDeviceApprovalSubject, string> = {
  [MEDICAL_DEVICE_APPROVAL_SUBJECTS.capaClose]: "open",
  [MEDICAL_DEVICE_APPROVAL_SUBJECTS.changeImplement]: "open",
  [MEDICAL_DEVICE_APPROVAL_SUBJECTS.docRevision]: "draft",
  [MEDICAL_DEVICE_APPROVAL_SUBJECTS.gvpReport]: "open",
};

const SUBJECT_TYPE: Record<MedicalDeviceApprovalSubject, MedicalDeviceLedgerType> = {
  [MEDICAL_DEVICE_APPROVAL_SUBJECTS.capaClose]: "capa",
  [MEDICAL_DEVICE_APPROVAL_SUBJECTS.changeImplement]: "change_control",
  [MEDICAL_DEVICE_APPROVAL_SUBJECTS.docRevision]: "document_control",
  [MEDICAL_DEVICE_APPROVAL_SUBJECTS.gvpReport]: "adverse_event",
};

export function isMedicalDeviceApprovalSubject(
  subjectType: string
): subjectType is MedicalDeviceApprovalSubject {
  return Object.values(MEDICAL_DEVICE_APPROVAL_SUBJECTS).includes(
    subjectType as MedicalDeviceApprovalSubject
  );
}

export function proposeMedicalDeviceApproval(opts: {
  subjectType: MedicalDeviceApprovalSubject;
  subjectRef: string;
  proposedBy: string;
  message?: string;
}): OrgApprovalRequest {
  const approval = proposeOrgApproval({
    scope: "internal",
    subjectType: opts.subjectType,
    subjectRef: opts.subjectRef,
    proposedBy: opts.proposedBy,
    message: opts.message,
  });
  appendMedicalDeviceAudit({
    actor: opts.proposedBy,
    op: "approval.propose",
    entity_type: opts.subjectType,
    entity_id: opts.subjectRef,
    summary: `Proposed ${opts.subjectType} for ${opts.subjectRef} → ${approval.approval_id}`,
    detail: { approval_id: approval.approval_id },
  });
  return approval;
}

/**
 * Snapshot current status then move to pending_approval / in_review.
 * Enables reject to restore prior status (e.g. effectiveness_check).
 */
export function markPendingMedicalDeviceApproval(opts: {
  subjectType: MedicalDeviceApprovalSubject;
  subjectRef: string;
  approvalId: string;
  actor?: string;
  pendingStatus?: "pending_approval" | "in_review";
  op: string;
}): void {
  const type = SUBJECT_TYPE[opts.subjectType];
  const ledger = findLedgerByType(type);
  if (!ledger) throw new Error(`ledger type not registered: ${type}`);
  const entry = loadLedgerEntries(ledger.data_file).find((e) => String(e.id) === opts.subjectRef);
  if (!entry) throw new Error(`entry not found: ${opts.subjectRef}`);
  const before = String(entry.status ?? "open");
  updateLedgerEntry({
    type,
    id: opts.subjectRef,
    patch: {
      status: opts.pendingStatus ?? "pending_approval",
      approval_id: opts.approvalId,
      status_before_approval: before,
    },
    actor: opts.actor,
    op: opts.op,
  });
}

function requireSubjectRef(approval: OrgApprovalRequest): string {
  const ref = approval.subject_ref?.trim();
  if (!ref) {
    throw new Error(
      `medical-device approval ${approval.approval_id} missing subject_ref (${approval.subject_type})`
    );
  }
  return ref;
}

function assertEntryExists(type: MedicalDeviceLedgerType, id: string): void {
  const ledger = findLedgerByType(type);
  if (!ledger) {
    throw new Error(`medical-device ledger type not registered: ${type}`);
  }
  const found = loadLedgerEntries(ledger.data_file).some((e) => String(e.id) === id);
  if (!found) {
    throw new Error(`medical-device entry not found: ${type}/${id}`);
  }
}

/**
 * After human org approval, mutate the linked medical-device ledger entry.
 * Throws on failure so callers can refuse to finalize the approval.
 */
export function applyMedicalDeviceApproval(approval: OrgApprovalRequest): {
  applied: boolean;
  entryId: string;
  type: MedicalDeviceLedgerType;
} {
  if (!isMedicalDeviceApprovalSubject(approval.subject_type)) {
    throw new Error(`not a medical_device subject: ${approval.subject_type}`);
  }
  const ref = requireSubjectRef(approval);
  const mapping = applyPatchFor(approval.subject_type);
  assertEntryExists(mapping.type, ref);
  try {
    updateLedgerEntry({
      type: mapping.type,
      id: ref,
      patch: {
        ...mapping.patch,
        approval_id: approval.approval_id,
      },
      actor: approval.approver_id,
      op: mapping.op,
    });
  } catch (err) {
    appendMedicalDeviceAudit({
      actor: approval.approver_id,
      op: "approval.apply.error",
      entity_type: approval.subject_type,
      entity_id: ref,
      summary: `Apply failed: ${err instanceof Error ? err.message : String(err)}`,
      detail: { approval_id: approval.approval_id },
    });
    throw err instanceof Error
      ? err
      : new Error(`medical-device apply failed for ${ref}: ${String(err)}`);
  }
  appendMedicalDeviceAudit({
    actor: approval.approver_id,
    op: "approval.apply",
    entity_type: mapping.type,
    entity_id: ref,
    summary: `Applied ${approval.subject_type} → ${ref} (${String(mapping.patch.status)})`,
    detail: { approval_id: approval.approval_id },
  });
  return { applied: true, entryId: ref, type: mapping.type };
}

/**
 * On rejection, restore ledger entries that were waiting on this approval.
 * Prefers `status_before_approval` when present.
 */
export function revertMedicalDeviceApproval(approval: OrgApprovalRequest): {
  reverted: boolean;
  entryId?: string;
  type?: MedicalDeviceLedgerType;
} {
  if (!isMedicalDeviceApprovalSubject(approval.subject_type)) {
    return { reverted: false };
  }
  const ref = approval.subject_ref?.trim();
  if (!ref) return { reverted: false };
  const type = SUBJECT_TYPE[approval.subject_type];
  try {
    const ledger = findLedgerByType(type);
    if (!ledger) return { reverted: false };
    const entry = loadLedgerEntries(ledger.data_file).find((e) => String(e.id) === ref);
    if (!entry) return { reverted: false };
    const status = String(entry.status ?? "");
    if (status !== "pending_approval" && status !== "in_review") {
      return { reverted: false, entryId: ref, type };
    }
    const restore =
      entry.status_before_approval != null && String(entry.status_before_approval).trim()
        ? String(entry.status_before_approval)
        : DEFAULT_REVERT_STATUS[approval.subject_type];
    updateLedgerEntry({
      type,
      id: ref,
      patch: { status: restore, status_before_approval: undefined },
      actor: approval.approver_id,
      op: `approval.revert.${approval.subject_type.split(".").pop()}`,
    });
    appendMedicalDeviceAudit({
      actor: approval.approver_id,
      op: "approval.revert",
      entity_type: type,
      entity_id: ref,
      summary: `Reverted ${approval.subject_type} → ${ref} (${restore})`,
      detail: { approval_id: approval.approval_id },
    });
    return { reverted: true, entryId: ref, type };
  } catch (err) {
    appendMedicalDeviceAudit({
      actor: approval.approver_id,
      op: "approval.revert.error",
      entity_type: approval.subject_type,
      entity_id: ref,
      summary: `Revert failed: ${err instanceof Error ? err.message : String(err)}`,
      detail: { approval_id: approval.approval_id },
    });
    throw err instanceof Error ? err : new Error(String(err));
  }
}
