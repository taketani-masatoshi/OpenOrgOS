import {
  MEDICAL_DEVICE_APPROVAL_SUBJECTS,
  medicalDeviceAeSeriousness,
  medicalDeviceAuthority,
  medicalDeviceCapaSource,
  medicalDeviceChangeType,
  medicalDeviceDefectClass,
  medicalDeviceGvpCatalogFileSchema,
  medicalDeviceLedgerFileSchema,
  medicalDeviceLedgerRegistryFileSchema,
  medicalDeviceLedgerType,
  medicalDeviceLicenseRegistryFileSchema,
  medicalDeviceObligationsFileSchema,
  medicalDeviceQmsCatalogFileSchema,
  medicalDeviceSeverity,
  type MedicalDeviceBusinessRole,
  type MedicalDeviceLedgerType,
} from "../../../../../../schemas/jp-medical-device.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import { loadModuleDataFile } from "../../../../../../src/lib/module-business-data.js";
import { collectMedicalDeviceDeadlines } from "../../../../../../src/lib/medical-device/deadlines.js";
import {
  markPendingMedicalDeviceApproval,
  proposeMedicalDeviceApproval,
} from "../../../../../../src/lib/medical-device/approvals.js";
import { listMedicalDeviceAudit } from "../../../../../../src/lib/medical-device/audit.js";
import {
  assertCapaEntryCloseable,
  assertChangeEntryImplementable,
  assertInquiryEntryCloseable,
  MedicalDeviceGateError,
} from "../../../../../../src/lib/medical-device/close-gates.js";
import {
  addLedgerEntry,
  closeLedgerEntry,
  findLedgerByType,
  isOpenLedgerEntry,
  loadLedgerEntries,
  parseJsonFields,
  updateLedgerEntry,
} from "../../../../../../src/lib/medical-device/ledger-ops.js";
import { runEscalation } from "../../../../../../src/lib/escalate.js";
import { currentDate } from "../../../../../../src/lib/utils.js";
import { MODULE_ID, ROLE_LABELS, loadYaml, resolveTemplatePath } from "./shared.js";

function exitOnGate(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`✗ ${msg}`);
  process.exit(1);
}

export function runJpMedicalDeviceValidate(): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  const obligations = loadYaml("obligations-catalog.yaml", medicalDeviceObligationsFileSchema);
  const qms = loadYaml("qms-catalog.yaml", medicalDeviceQmsCatalogFileSchema);
  const gvp = loadYaml("gvp-catalog.yaml", medicalDeviceGvpCatalogFileSchema);
  const licenses = loadYaml("license-registry.yaml", medicalDeviceLicenseRegistryFileSchema);
  const ledgers = loadYaml("ledger-registry.yaml", medicalDeviceLedgerRegistryFileSchema);
  if (!obligations) errors.push("obligations-catalog.yaml missing");
  if (!qms) errors.push("qms-catalog.yaml missing");
  if (!gvp) errors.push("gvp-catalog.yaml missing");
  if (!licenses) errors.push("license-registry.yaml missing");
  if (!ledgers) errors.push("ledger-registry.yaml missing");
  if (qms) {
    for (const doc of qms.data.documents) {
      if (!resolveTemplatePath(doc.template)) {
        errors.push(`QMS ${doc.id}: template missing (${doc.template})`);
      }
    }
  }
  if (gvp) {
    for (const doc of gvp.data.documents) {
      if (!resolveTemplatePath(doc.template)) {
        errors.push(`GVP ${doc.id}: template missing (${doc.template})`);
      }
    }
  }
  if (ledgers) {
    for (const ledger of ledgers.data.ledgers) {
      if (!loadModuleDataFile(MODULE_ID, ledger.data_file, medicalDeviceLedgerFileSchema)) {
        errors.push(`ledger ${ledger.id}: data file missing (${ledger.data_file})`);
      }
    }
  }

  if (licenses) {
    for (const lic of licenses.data.licenses) {
      if (lic.status === "active" && !lic.expires_on) {
        errors.push(`license ${lic.id}: active but expires_on missing`);
      }
    }
  }

  const deadlines = collectMedicalDeviceDeadlines({ includeOk: false });
  for (const d of deadlines) {
    if (d.severity === "overdue") {
      if (d.kind === "gvp_report" || d.kind === "capa" || d.kind === "inquiry") {
        errors.push(`${d.kind} ${d.id}: overdue (${d.due})`);
      } else {
        warnings.push(`${d.kind} ${d.id}: expired/overdue (${d.due})`);
      }
    }
  }

  const docLedger = findLedgerByType("document_control");
  if (docLedger) {
    for (const e of loadLedgerEntries(docLedger.data_file)) {
      if (String(e.status) === "draft" || String(e.status) === "in_review") {
        warnings.push(`document ${e.doc_id ?? e.id}: status=${e.status} (未承認)`);
      }
    }
  }

  if (errors.length) {
    console.error("✗ jp_medical_device:");
    for (const e of errors) console.error(`  - ${e}`);
    for (const w of warnings) console.error(`  ! ${w}`);
    process.exit(1);
  }
  for (const w of warnings) console.log(`! ${w}`);
  console.log("✓ jp_medical_device — medical device QMS/GVP data OK");
}

export function runJpMedicalDeviceShow(opts: { json?: boolean }): void {
  const jurisdiction = getResolvedJurisdiction();
  const obligations = loadYaml("obligations-catalog.yaml", medicalDeviceObligationsFileSchema);
  const qms = loadYaml("qms-catalog.yaml", medicalDeviceQmsCatalogFileSchema);
  const gvp = loadYaml("gvp-catalog.yaml", medicalDeviceGvpCatalogFileSchema);
  const licenses = loadYaml("license-registry.yaml", medicalDeviceLicenseRegistryFileSchema);
  const summary = {
    jurisdiction: jurisdiction.code,
    roles: obligations?.data.roles.length ?? 0,
    obligations: obligations?.data.obligations.length ?? 0,
    qms_documents: qms?.data.documents.length ?? 0,
    gvp_documents: gvp?.data.documents.length ?? 0,
    licenses: licenses?.data.licenses.length ?? 0,
    deadlines_attention: collectMedicalDeviceDeadlines().length,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log("# jp_medical_device\n");
  console.log(`法域: ${summary.jurisdiction} · 業態 ${summary.roles} · 義務 ${summary.obligations}`);
  console.log(
    `QMS ${summary.qms_documents} · GVP ${summary.gvp_documents} · 許可 ${summary.licenses} · 期限注意 ${summary.deadlines_attention}\n`
  );
  console.log("```bash");
  console.log("npm run orgos -- operations medical-device obligations --role mah");
  console.log("npm run orgos -- operations medical-device deadlines");
  console.log("npm run orgos -- operations medical-device qms draft --doc QMS-MAN-001 --write");
  console.log("npm run orgos -- operations medical-device ledger status");
  console.log("```");
}

export function runJpMedicalDeviceObligations(opts: {
  role?: string;
  json?: boolean;
}): void {
  const obligations = loadYaml("obligations-catalog.yaml", medicalDeviceObligationsFileSchema);
  if (!obligations) {
    console.error("obligations-catalog.yaml missing — run modules activate jp_medical_device");
    process.exit(1);
  }
  const roleFilter = opts.role as MedicalDeviceBusinessRole | undefined;
  const roles = roleFilter
    ? obligations.data.roles.filter((r) => r.id === roleFilter)
    : obligations.data.roles;
  const obList = obligations.data.obligations.filter(
    (o) => !roleFilter || o.role_ids.includes(roleFilter)
  );
  if (opts.json) {
    console.log(JSON.stringify({ roles, obligations: obList }, null, 2));
    return;
  }
  console.log("# 医療機器 業態別義務\n");
  for (const r of roles) {
    console.log(`## ${ROLE_LABELS[r.id]} (${r.id})\n`);
    console.log(`- 法的根拠: ${r.legal_basis}`);
    console.log(`- 許可: ${r.permit_type}`);
    if (r.qms_basis) console.log(`- QMS: ${r.qms_basis}`);
    console.log(`- GVP: ${r.gvp_required ? "要" : "—"}`);
    console.log("");
  }
  console.log("## 義務一覧\n");
  for (const o of obList) {
    console.log(
      `- \`${o.id}\` · ${o.title} · [${o.category}] · ${o.role_ids.map((id) => ROLE_LABELS[id]).join("/")}`
    );
  }
}

export function runJpMedicalDeviceLedgerList(opts: { json?: boolean }): void {
  const ledgers = loadYaml("ledger-registry.yaml", medicalDeviceLedgerRegistryFileSchema);
  if (!ledgers) process.exit(1);
  if (opts.json) {
    console.log(JSON.stringify(ledgers.data, null, 2));
    return;
  }
  console.log("# 台帳一覧\n");
  for (const l of ledgers.data.ledgers) {
    console.log(`- \`${l.id}\` · ${l.title} · ${l.data_file} · 保管 ${l.retention_years ?? "?"}年`);
  }
}

export function runJpMedicalDeviceLedgerStatus(opts: { json?: boolean }): void {
  const ledgers = loadYaml("ledger-registry.yaml", medicalDeviceLedgerRegistryFileSchema);
  if (!ledgers) process.exit(1);
  const rows = ledgers.data.ledgers.map((l) => {
    const entries = loadLedgerEntries(l.data_file);
    return {
      id: l.id,
      title: l.title,
      entries: entries.length,
      open: entries.filter(isOpenLedgerEntry).length,
      data_file: l.data_file,
    };
  });
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log("# 台帳ステータス\n");
  console.log("| 台帳 | 件数 | 未クローズ | ファイル |");
  console.log("|------|-----:|----------:|---------|");
  for (const r of rows) {
    console.log(`| ${r.title} | ${r.entries} | ${r.open} | ${r.data_file} |`);
  }
}

export function runJpMedicalDeviceDeadlines(opts: { json?: boolean; all?: boolean }): void {
  const items = collectMedicalDeviceDeadlines({ includeOk: !!opts.all });
  if (opts.json) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  console.log("# 医療機器 期限スキャン\n");
  if (!items.length) {
    console.log("（注意期限なし）");
    return;
  }
  console.log("| 種別 | ID | 期限 | 残日 | 状態 |");
  console.log("|------|----|------|-----:|------|");
  for (const i of items) {
    console.log(`| ${i.kind} | ${i.id} | ${i.due} | ${i.days} | ${i.severity} |`);
  }
}

export function runJpMedicalDeviceLedgerAdd(opts: {
  type: string;
  jsonFields?: string;
  actor?: string;
  json?: boolean;
}): void {
  const type = medicalDeviceLedgerType.parse(opts.type);
  const fields = parseJsonFields(opts.jsonFields);
  const result = addLedgerEntry({ type, fields, actor: opts.actor });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ added ${type} ${result.entry.id} → ${result.path}`);
}

export function runJpMedicalDeviceLedgerClose(opts: {
  type: string;
  id: string;
  actor?: string;
  force?: boolean;
  json?: boolean;
}): void {
  const type = medicalDeviceLedgerType.parse(opts.type);
  try {
    const result = closeLedgerEntry({
      type,
      id: opts.id,
      actor: opts.actor,
      force: opts.force,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`✓ closed ${type} ${opts.id}`);
  } catch (err) {
    if (err instanceof MedicalDeviceGateError) exitOnGate(err);
    throw err;
  }
}

function listTypedLedger(type: MedicalDeviceLedgerType, opts: { json?: boolean; openOnly?: boolean }) {
  const ledger = findLedgerByType(type);
  if (!ledger) {
    console.error(`ledger ${type} not registered`);
    process.exit(1);
  }
  let entries = loadLedgerEntries(ledger.data_file);
  if (opts.openOnly) entries = entries.filter(isOpenLedgerEntry);
  if (opts.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }
  console.log(`# ${ledger.title}\n`);
  for (const e of entries) {
    console.log(`- \`${e.id}\` · ${e.status ?? "?"} · ${e.title ?? e.topic ?? e.summary ?? ""}`);
  }
}

export function runJpMedicalDeviceCapaOpen(opts: {
  source: string;
  title: string;
  sourceRef?: string;
  dueOn?: string;
  actor?: string;
  json?: boolean;
}): void {
  const source = medicalDeviceCapaSource.parse(opts.source);
  const result = addLedgerEntry({
    type: "capa",
    actor: opts.actor,
    fields: {
      source,
      source_ref: opts.sourceRef,
      title: opts.title,
      due_on: opts.dueOn,
    },
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ CAPA ${result.entry.id}`);
}

export function runJpMedicalDeviceCapaList(opts: { json?: boolean; open?: boolean }): void {
  listTypedLedger("capa", { json: opts.json, openOnly: opts.open });
}

function loadCapaEntryOrExit(id: string): Record<string, unknown> {
  const ledger = findLedgerByType("capa");
  if (!ledger) {
    console.error("capa ledger not registered");
    process.exit(1);
  }
  const entry = loadLedgerEntries(ledger.data_file).find((e) => String(e.id) === id);
  if (!entry) {
    console.error(`CAPA not found: ${id}`);
    process.exit(1);
  }
  return entry;
}

function assertCapaCloseable(id: string, force?: boolean): void {
  try {
    assertCapaEntryCloseable(loadCapaEntryOrExit(id), { force });
  } catch (err) {
    if (err instanceof MedicalDeviceGateError) exitOnGate(err);
    throw err;
  }
}

export function runJpMedicalDeviceCapaScheduleEffectiveness(opts: {
  id: string;
  on: string;
  actor?: string;
  json?: boolean;
}): void {
  loadCapaEntryOrExit(opts.id);
  const result = updateLedgerEntry({
    type: "capa",
    id: opts.id,
    patch: {
      effectiveness_check_on: opts.on,
      effectiveness_result: "pending",
      status: "effectiveness_check",
    },
    actor: opts.actor,
    op: "capa.schedule_effectiveness",
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ CAPA ${opts.id} → effectiveness_check (on ${opts.on})`);
}

export function runJpMedicalDeviceCapaRecordEffectiveness(opts: {
  id: string;
  result: string;
  notes?: string;
  actor?: string;
  json?: boolean;
}): void {
  loadCapaEntryOrExit(opts.id);
  if (opts.result !== "effective" && opts.result !== "ineffective") {
    console.error("--result must be effective|ineffective");
    process.exit(1);
  }
  const nextStatus = opts.result === "effective" ? "in_progress" : "open";
  const patch: Record<string, unknown> = {
    effectiveness_result: opts.result,
    status: nextStatus,
  };
  if (opts.notes) patch.notes = opts.notes;
  const updated = updateLedgerEntry({
    type: "capa",
    id: opts.id,
    patch,
    actor: opts.actor,
    op: "capa.record_effectiveness",
  });
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(`✓ CAPA ${opts.id} effectiveness=${opts.result} → ${nextStatus}`);
}

export function runJpMedicalDeviceCapaClose(opts: {
  id: string;
  proposeApproval?: boolean;
  proposedBy?: string;
  actor?: string;
  force?: boolean;
  json?: boolean;
}): void {
  assertCapaCloseable(opts.id, opts.force);
  if (opts.proposeApproval) {
    const by = opts.proposedBy ?? opts.actor ?? "operator";
    const approval = proposeMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.capaClose,
      subjectRef: opts.id,
      proposedBy: by,
      message: `CAPA close ${opts.id}`,
    });
    markPendingMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.capaClose,
      subjectRef: opts.id,
      approvalId: approval.approval_id,
      actor: opts.actor,
      op: "capa.propose_close",
    });
    if (opts.json) {
      console.log(JSON.stringify({ approval_id: approval.approval_id, id: opts.id }, null, 2));
      return;
    }
    console.log(`✓ CAPA ${opts.id} → pending_approval (${approval.approval_id})`);
    console.log("  人間: orgos org approval approve --id ... --reviewed");
    return;
  }
  try {
    const result = closeLedgerEntry({
      type: "capa",
      id: opts.id,
      actor: opts.actor,
      force: opts.force,
      skipGates: true,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`✓ CAPA closed ${opts.id}`);
  } catch (err) {
    if (err instanceof MedicalDeviceGateError) exitOnGate(err);
    throw err;
  }
}

export function runJpMedicalDeviceChangeOpen(opts: {
  changeType: string;
  title: string;
  deviceId?: string;
  riskReview?: string;
  actor?: string;
  json?: boolean;
}): void {
  const change_type = medicalDeviceChangeType.parse(opts.changeType);
  const result = addLedgerEntry({
    type: "change_control",
    actor: opts.actor,
    fields: {
      change_type,
      title: opts.title,
      device_id: opts.deviceId,
      risk_review: opts.riskReview,
    },
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ change ${result.entry.id}`);
}

export function runJpMedicalDeviceChangeList(opts: { json?: boolean; open?: boolean }): void {
  listTypedLedger("change_control", { json: opts.json, openOnly: opts.open });
}

export function runJpMedicalDeviceChangeProposeImplement(opts: {
  id: string;
  proposedBy: string;
  actor?: string;
  force?: boolean;
  json?: boolean;
}): void {
  const ledger = findLedgerByType("change_control");
  if (!ledger) {
    console.error("change_control ledger not registered");
    process.exit(1);
  }
  const entry = loadLedgerEntries(ledger.data_file).find((e) => String(e.id) === opts.id);
  if (!entry) {
    console.error(`change not found: ${opts.id}`);
    process.exit(1);
  }
  try {
    assertChangeEntryImplementable(entry, { force: opts.force });
  } catch (err) {
    if (err instanceof MedicalDeviceGateError) exitOnGate(err);
    throw err;
  }
  const approval = proposeMedicalDeviceApproval({
    subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.changeImplement,
    subjectRef: opts.id,
    proposedBy: opts.proposedBy,
    message: `Change implement ${opts.id}`,
  });
  markPendingMedicalDeviceApproval({
    subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.changeImplement,
    subjectRef: opts.id,
    approvalId: approval.approval_id,
    actor: opts.actor,
    op: "change.propose_implement",
  });
  if (opts.json) {
    console.log(JSON.stringify({ approval_id: approval.approval_id }, null, 2));
    return;
  }
  console.log(`✓ change ${opts.id} → pending_approval (${approval.approval_id})`);
}

export function runJpMedicalDeviceInquiryOpen(opts: {
  authority: string;
  title: string;
  dueOn?: string;
  actor?: string;
  json?: boolean;
}): void {
  const authority = medicalDeviceAuthority.parse(opts.authority);
  const result = addLedgerEntry({
    type: "authority_inquiry",
    actor: opts.actor,
    fields: {
      authority,
      title: opts.title,
      due_on: opts.dueOn,
    },
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ inquiry ${result.entry.id}`);
}

export function runJpMedicalDeviceInquiryList(opts: { json?: boolean; open?: boolean }): void {
  listTypedLedger("authority_inquiry", { json: opts.json, openOnly: opts.open });
}

export function runJpMedicalDeviceInquirySetResponse(opts: {
  id: string;
  path: string;
  actor?: string;
  json?: boolean;
}): void {
  const result = updateLedgerEntry({
    type: "authority_inquiry",
    id: opts.id,
    patch: { response_draft_path: opts.path },
    actor: opts.actor,
    op: "inquiry.set_response_draft",
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ inquiry ${opts.id} response_draft_path=${opts.path}`);
}

export function runJpMedicalDeviceInquiryClose(opts: {
  id: string;
  respondedOn?: string;
  actor?: string;
  force?: boolean;
  json?: boolean;
}): void {
  const ledger = findLedgerByType("authority_inquiry");
  if (!ledger) {
    console.error("authority_inquiry ledger not registered");
    process.exit(1);
  }
  const entry = loadLedgerEntries(ledger.data_file).find((e) => String(e.id) === opts.id);
  if (!entry) {
    console.error(`inquiry not found: ${opts.id}`);
    process.exit(1);
  }
  try {
    assertInquiryEntryCloseable(entry, { force: opts.force });
  } catch (err) {
    if (err instanceof MedicalDeviceGateError) exitOnGate(err);
    throw err;
  }
  if (opts.respondedOn) {
    updateLedgerEntry({
      type: "authority_inquiry",
      id: opts.id,
      patch: { responded_on: opts.respondedOn },
      actor: opts.actor,
      op: "inquiry.set_responded_on",
    });
  }
  try {
    const result = closeLedgerEntry({
      type: "authority_inquiry",
      id: opts.id,
      actor: opts.actor,
      force: opts.force,
      skipGates: true,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`✓ inquiry closed ${opts.id}`);
  } catch (err) {
    if (err instanceof MedicalDeviceGateError) exitOnGate(err);
    throw err;
  }
}

export function runJpMedicalDevicePmsList(opts: { json?: boolean; open?: boolean }): void {
  listTypedLedger("pms", { json: opts.json, openOnly: opts.open });
}

export function runJpMedicalDevicePmsOpen(opts: {
  deviceId: string;
  planPeriod: string;
  nextReviewOn?: string;
  dataSources?: string;
  actor?: string;
  json?: boolean;
}): void {
  const result = addLedgerEntry({
    type: "pms",
    actor: opts.actor,
    fields: {
      device_id: opts.deviceId,
      plan_period: opts.planPeriod,
      next_review_on: opts.nextReviewOn,
      data_sources: opts.dataSources
        ? opts.dataSources.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    },
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ PMS ${result.entry.id}`);
}

export function runJpMedicalDevicePmsReview(opts: {
  id: string;
  nextReviewOn: string;
  actor?: string;
  json?: boolean;
}): void {
  const result = updateLedgerEntry({
    type: "pms",
    id: opts.id,
    patch: { next_review_on: opts.nextReviewOn },
    actor: opts.actor,
    op: "pms.review",
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ PMS ${opts.id} next_review_on=${opts.nextReviewOn}`);
}

export function runJpMedicalDeviceGvpEscalate(opts: {
  id: string;
  actor?: string;
  proposeApproval?: boolean;
  proposedBy?: string;
  workOrder?: boolean;
  noWorkOrder?: boolean;
  json?: boolean;
}): void {
  let approvalId: string | undefined;
  if (opts.proposeApproval) {
    const by = opts.proposedBy ?? opts.actor ?? "operator";
    const approval = proposeMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.gvpReport,
      subjectRef: opts.id,
      proposedBy: by,
      message: `GVP report draft confirm ${opts.id}`,
    });
    approvalId = approval.approval_id;
    updateLedgerEntry({
      type: "adverse_event",
      id: opts.id,
      patch: { escalated_at: new Date().toISOString() },
      actor: opts.actor,
      op: "gvp.escalate",
    });
    markPendingMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.gvpReport,
      subjectRef: opts.id,
      approvalId: approval.approval_id,
      actor: opts.actor,
      op: "gvp.propose_report",
    });
  } else {
    updateLedgerEntry({
      type: "adverse_event",
      id: opts.id,
      patch: { escalated_at: new Date().toISOString() },
      actor: opts.actor,
      op: "gvp.escalate",
    });
  }
  const result = {
    entry:
      loadLedgerEntries(findLedgerByType("adverse_event")!.data_file).find(
        (e) => String(e.id) === opts.id
      ) ?? {},
  };

  let workOrderId: string | undefined;
  const createWo = opts.workOrder !== false && !opts.noWorkOrder;
  if (createWo) {
    try {
      const esc = runEscalation({
        fromAgent: "medical_device_regulatory",
        input: {
          subject: `GVP エスカレーション ${opts.id}`,
          background: `有害事象 ${opts.id} を安全管理責任者へエスカレ。gvp_due_on=${String(result.entry.gvp_due_on ?? "")}`,
          requirements:
            `AE ${opts.id} を評価し、報告要否を判断。報告ドラフトを整備し、人間が PMDA へ提出する。自動提出は禁止。`,
          deliverables: [
            "評価メモ（L1）",
            "報告ドラフト（必要時）",
            "台帳更新（report_filed_on は提出後）",
          ],
          acceptance_criteria: [
            "安全管理責任者が内容を確認した",
            "提出は人間が実行した（または報告不要と記録した）",
          ],
          priority: "P1",
          path: "data/medical-device/ledgers/adverse-event-records.yaml",
          text: `医療機器 有害事象 GVP エスカレーション ${opts.id}`,
        },
      });
      workOrderId = esc.workOrders[0]?.id;
    } catch (err) {
      console.error(
        `work order: ${err instanceof Error ? err.message : String(err)}（台帳エスカレは完了）`
      );
    }
  }

  if (opts.json) {
    console.log(
      JSON.stringify({ ...result, approval_id: approvalId, work_order_id: workOrderId }, null, 2)
    );
    return;
  }
  console.log(`✓ AE ${opts.id} escalated${approvalId ? ` · approval ${approvalId}` : ""}`);
  if (workOrderId) console.log(`  work order: ${workOrderId}`);
  console.log("  ※ PMDA 提出は人間が実行（自動提出なし）");
}

export function runJpMedicalDeviceComplaintAdd(opts: {
  summary?: string;
  severity?: string;
  defectClass?: string;
  deviceId?: string;
  reportable?: boolean;
  actor?: string;
  json?: boolean;
}): void {
  const result = addLedgerEntry({
    type: "complaint",
    actor: opts.actor,
    fields: {
      summary: opts.summary,
      severity: opts.severity ? medicalDeviceSeverity.parse(opts.severity) : "minor",
      defect_class: opts.defectClass
        ? medicalDeviceDefectClass.parse(opts.defectClass)
        : "other",
      device_id: opts.deviceId,
      reportable: opts.reportable ?? false,
    },
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ complaint ${result.entry.id}`);
}

export function runJpMedicalDeviceAeAdd(opts: {
  summary?: string;
  seriousness?: string;
  deviceId?: string;
  actor?: string;
  json?: boolean;
}): void {
  const seriousness = opts.seriousness
    ? medicalDeviceAeSeriousness.parse(opts.seriousness)
    : "other";
  const result = addLedgerEntry({
    type: "adverse_event",
    actor: opts.actor,
    fields: {
      summary: opts.summary,
      seriousness,
      device_id: opts.deviceId,
    },
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ AE ${result.entry.id} · gvp_due_on=${result.entry.gvp_due_on}`);
}

/** Human filing fact — clears GVP overdue. Distinct from gvp_report approval. */
export function runJpMedicalDeviceAeMarkFiled(opts: {
  id: string;
  on?: string;
  actor?: string;
  json?: boolean;
}): void {
  const filedOn = opts.on?.trim() || currentDate();
  const result = updateLedgerEntry({
    type: "adverse_event",
    id: opts.id,
    patch: { report_filed_on: filedOn, status: "closed" },
    actor: opts.actor,
    op: "ae.mark_filed",
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ AE ${opts.id} report_filed_on=${filedOn}（提出は人間が実行済みとして記録）`);
}

/** Promote reportable complaint → AE with back-link. */
export function runJpMedicalDeviceComplaintPromoteAe(opts: {
  id: string;
  seriousness?: string;
  actor?: string;
  json?: boolean;
}): void {
  const ledger = findLedgerByType("complaint");
  if (!ledger) {
    console.error("complaint ledger not registered");
    process.exit(1);
  }
  const complaint = loadLedgerEntries(ledger.data_file).find((e) => String(e.id) === opts.id);
  if (!complaint) {
    console.error(`complaint not found: ${opts.id}`);
    process.exit(1);
  }
  const seriousness = opts.seriousness
    ? medicalDeviceAeSeriousness.parse(opts.seriousness)
    : "other";
  const ae = addLedgerEntry({
    type: "adverse_event",
    actor: opts.actor,
    fields: {
      summary: complaint.summary ?? `from complaint ${opts.id}`,
      device_id: complaint.device_id,
      source: `complaint:${opts.id}`,
      seriousness,
      defect_class: complaint.defect_class ?? "safety",
      reportable: true,
    },
  });
  updateLedgerEntry({
    type: "complaint",
    id: opts.id,
    patch: {
      status: "in_progress",
      ae_id: String(ae.entry.id),
    },
    actor: opts.actor,
    op: "complaint.promote_ae",
  });
  if (opts.json) {
    console.log(JSON.stringify({ complaint_id: opts.id, ae: ae.entry }, null, 2));
    return;
  }
  console.log(`✓ complaint ${opts.id} → AE ${ae.entry.id}`);
}

export function runJpMedicalDeviceAuditList(opts: {
  limit?: number;
  op?: string;
  entityId?: string;
  json?: boolean;
}): void {
  const rows = listMedicalDeviceAudit({
    limit: opts.limit,
    op: opts.op,
    entityId: opts.entityId,
  });
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log("# 医療機器 監査証跡（直近）\n");
  if (!rows.length) {
    console.log("（なし）");
    return;
  }
  for (const r of rows) {
    console.log(`- ${r.timestamp} · ${r.op} · ${r.entity_type}/${r.entity_id} · ${r.summary}`);
  }
}

export function runJpMedicalDeviceDocProposeApproval(opts: {
  id: string;
  proposedBy: string;
  actor?: string;
  json?: boolean;
}): void {
  const approval = proposeMedicalDeviceApproval({
    subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.docRevision,
    subjectRef: opts.id,
    proposedBy: opts.proposedBy,
    message: `Document revision ${opts.id}`,
  });
  markPendingMedicalDeviceApproval({
    subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.docRevision,
    subjectRef: opts.id,
    approvalId: approval.approval_id,
    actor: opts.actor,
    pendingStatus: "in_review",
    op: "document.propose_approval",
  });
  if (opts.json) {
    console.log(JSON.stringify({ approval_id: approval.approval_id }, null, 2));
    return;
  }
  console.log(`✓ document ${opts.id} → in_review (${approval.approval_id})`);
}
