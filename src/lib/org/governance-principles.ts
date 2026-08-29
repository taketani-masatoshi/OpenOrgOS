import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import {
  iso37000SelfDeclarationSchema,
  type Iso37000SelfDeclaration,
} from "../../../schemas/org/iso-37000-self-declaration.js";
import { controlMapFileSchema, type ControlDefinition } from "../../../schemas/control-framework.js";
import { getInstallRoot } from "../orgos-paths.js";
import { getTenantDir } from "../tenant.js";
import { loadCompany } from "../data.js";
import { hasEvidenceForControl } from "../control-framework.js";
import { loadGovernancePolicy } from "./governance-policy.js";
import { loadOperatorRegistry } from "./operators.js";

export const PRINCIPLE_TITLES: Record<string, string> = {
  "P-01": "Purpose（目的）",
  "P-02": "Value generation（価値創出）",
  "P-03": "Strategy（戦略）",
  "P-04": "Oversight（監督）",
  "P-05": "Accountability（説明責任）",
  "P-06": "Stakeholder engagement（ステークホルダー）",
  "P-07": "Leadership（リーダーシップ）",
  "P-08": "Data and decisions（データと意思決定）",
  "P-09": "Risk governance（リスクの統治）",
  "P-10": "Social responsibility（社会的責任）",
  "P-11": "Viability and performance over time",
};

const WEAK_PURPOSE =
  /スケルトン|TBD|人間が確定|未設定|TODO|\[TBD\]|placeholder|ここに書く/i;

export const ISO37000_DECLARATION_REL =
  "data/compliance/iso-37000-self-declaration.yaml";
export const ISO37000_DECLARATION_MD_REL =
  "docs/compliance/iso/ISO-37000/self-declaration.md";
export const ISO37000_APPLICABILITY_REL =
  "docs/compliance/iso/ISO-37000/principles-applicability.md";

export function governancePrinciplesRulePath(): string {
  return join(getInstallRoot(), "steward/rules/governance-principles.md");
}

export function iso37000ControlMapPath(): string {
  return join(getInstallRoot(), "steward/standards/iso/ISO-37000/control-map.yaml");
}

export function iso37000SelfDeclarationPath(): string {
  return join(getTenantDir(), ISO37000_DECLARATION_REL);
}

export type PrincipleAssessment = {
  principle_id: string;
  title: string;
  control_id: string;
  ok: boolean;
  missing_paths: string[];
  present_paths: string[];
  semantic_detail: string;
};

export type GovernancePrinciplesStatus = {
  standard: "ISO-37000";
  principles_rule_ok: boolean;
  control_map_ok: boolean;
  standard_enabled: boolean;
  purpose_ok: boolean;
  purpose_detail: string;
  applicability_ok: boolean;
  review_overdue: boolean;
  declaration: Iso37000SelfDeclaration | null;
  principles: PrincipleAssessment[];
  principles_ok: number;
  principles_total: number;
  ready_for_self_declaration: boolean;
  self_declared: boolean;
};

function isIso37000EnabledInStandards(): boolean {
  const path = join(getTenantDir(), "standards.yaml");
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf-8");
  if (!/id:\s*ISO-37000/.test(text)) return false;
  const block = text.match(/id:\s*ISO-37000\n([\s\S]*?)(?=\n\s*- id:|\n*$)/);
  if (!block) return false;
  return /enabled:\s*true/.test(block[1]!);
}

export function isStrongPurposeText(value: string | undefined): boolean {
  const t = value?.trim() ?? "";
  if (t.length < 12) return false;
  return !WEAK_PURPOSE.test(t);
}

export function assessPurpose(): { ok: boolean; detail: string } {
  const planPath = join(getTenantDir(), "data/plans/business-plan.yaml");
  if (!existsSync(planPath)) {
    return { ok: false, detail: "missing data/plans/business-plan.yaml" };
  }
  const plan = YAML.parse(readFileSync(planPath, "utf-8")) as {
    mission?: string;
    vision?: string;
    values?: string[];
  };
  const missionOk = isStrongPurposeText(plan.mission);
  const visionOk = isStrongPurposeText(plan.vision);
  if (missionOk && visionOk) {
    const valuesN = Array.isArray(plan.values) ? plan.values.length : 0;
    return {
      ok: true,
      detail: `business-plan mission/vision OK · values=${valuesN}`,
    };
  }
  return {
    ok: false,
    detail: `mission=${missionOk ? "OK" : "weak/missing"} · vision=${visionOk ? "OK" : "weak/missing"}`,
  };
}

function assessAccountability(): { ok: boolean; detail: string } {
  const ops = loadOperatorRegistry();
  const active = ops?.operators.filter((o) => o.status === "active") ?? [];
  if (!active.some((o) => o.role === "ceo")) {
    return { ok: false, detail: "active ceo が operators.yaml に無い" };
  }
  const auditors = active.filter((o) => o.role === "auditor");
  const ceos = active.filter((o) => o.role === "ceo");
  if (auditors.length > 0) {
    const overlap = auditors.some((a) =>
      ceos.some(
        (c) =>
          c.display_name === a.display_name ||
          (c.stakeholder_id && c.stakeholder_id === a.stakeholder_id),
      ),
    );
    if (overlap) {
      return { ok: false, detail: "ceo と auditor が同一主体" };
    }
    return { ok: true, detail: "auditor 席あり" };
  }
  const policy = loadGovernancePolicy();
  if (policy.forbid_ceo_auditor_overlap) {
    return {
      ok: true,
      detail: "補償統制: ceo/auditor 兼任禁止（独立監査役席は未設置）",
    };
  }
  return { ok: false, detail: "auditor も補償統制も無い" };
}

function principleIdFromControl(ctrl: ControlDefinition): string {
  const m = ctrl.id.match(/CTL-37000-(P-\d{2})$/);
  return m?.[1] ?? ctrl.id;
}

function isReviewOverdue(decl: Iso37000SelfDeclaration | null): boolean {
  if (!decl || decl.status !== "self_declared") return false;
  const next = decl.next_review?.trim();
  if (!next) return true;
  const today = new Date().toISOString().slice(0, 10);
  return next < today;
}

export function assessGovernancePrinciples(): GovernancePrinciplesStatus {
  const principlesRuleOk = existsSync(governancePrinciplesRulePath());
  const mapPath = iso37000ControlMapPath();
  const controlMapOk = existsSync(mapPath);
  let principles: PrincipleAssessment[] = [];

  if (controlMapOk) {
    const parsed = controlMapFileSchema.parse(YAML.parse(readFileSync(mapPath, "utf-8")));
    principles = parsed.controls.map((control) => {
      const present: string[] = [];
      const missing: string[] = [];
      for (const rel of control.evidence_paths) {
        const tenantPath = join(getTenantDir(), rel);
        if (existsSync(tenantPath)) present.push(rel);
        else missing.push(rel);
      }
      const evidenceOk = hasEvidenceForControl(control);
      const principleId = principleIdFromControl(control);
      let semanticOk = true;
      let semanticDetail = "evidence";
      if (principleId === "P-01") {
        const purpose = assessPurpose();
        semanticOk = purpose.ok;
        semanticDetail = purpose.detail;
      } else if (principleId === "P-05") {
        const acc = assessAccountability();
        semanticOk = acc.ok;
        semanticDetail = acc.detail;
      }
      return {
        principle_id: principleId,
        title: PRINCIPLE_TITLES[principleId] ?? control.title,
        control_id: control.id,
        ok: evidenceOk && semanticOk,
        missing_paths: evidenceOk ? [] : missing,
        present_paths: present,
        semantic_detail: semanticDetail,
      };
    });
  }

  const principlesOk = principles.filter((row) => row.ok).length;
  const principlesTotal = principles.length || 11;
  const purpose = assessPurpose();
  const applicabilityOk = existsSync(join(getTenantDir(), ISO37000_APPLICABILITY_REL));
  const standardEnabled = isIso37000EnabledInStandards();

  let declaration: Iso37000SelfDeclaration | null = null;
  const declPath = iso37000SelfDeclarationPath();
  if (existsSync(declPath)) {
    declaration = iso37000SelfDeclarationSchema.parse(YAML.parse(readFileSync(declPath, "utf-8")));
  }

  const ready =
    principlesRuleOk &&
    controlMapOk &&
    standardEnabled &&
    principlesOk === principlesTotal &&
    purpose.ok &&
    applicabilityOk;

  return {
    standard: "ISO-37000",
    principles_rule_ok: principlesRuleOk,
    control_map_ok: controlMapOk,
    standard_enabled: standardEnabled,
    purpose_ok: purpose.ok,
    purpose_detail: purpose.detail,
    applicability_ok: applicabilityOk,
    review_overdue: isReviewOverdue(declaration),
    declaration,
    principles,
    principles_ok: principlesOk,
    principles_total: principlesTotal,
    ready_for_self_declaration: ready,
    self_declared: declaration?.status === "self_declared",
  };
}

function renderDeclarationMarkdown(
  decl: Iso37000SelfDeclaration,
  status: GovernancePrinciplesStatus,
): string {
  const templatePath = join(
    getInstallRoot(),
    "steward/standards/iso/ISO-37000/self-declaration-template.md",
  );
  let body = readFileSync(templatePath, "utf-8");
  const byId = new Map(
    status.principles.map((row) => [row.principle_id, row.ok ? "充足" : "未充足"]),
  );
  for (const id of Object.keys(PRINCIPLE_TITLES)) {
    body = body.replaceAll(`{{${id}}}`, byId.get(id) ?? "未評価");
  }
  return body
    .replaceAll("{{company_name}}", decl.company_name ?? "（未設定）")
    .replaceAll("{{declared_at}}", decl.signed_at ?? "（未署名）")
    .replaceAll("{{signatory_role}}", decl.signatory_role)
    .replaceAll("{{signatory_name}}", decl.signatory_name ?? "（未記入）")
    .replaceAll("{{status}}", decl.status);
}

export function ensureIso37000EnabledInStandards(): void {
  const path = join(getTenantDir(), "standards.yaml");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf-8");
  if (/id:\s*ISO-37000/.test(text)) {
    writeFileSync(
      path,
      text.replace(/(id:\s*ISO-37000\r?\n[ \t]+enabled:\s*)false/, "$1true"),
      "utf-8",
    );
    return;
  }
  const addition = [
    "",
    "  - id: ISO-37000",
    "    enabled: true",
    "    notes: 組織ガバナンス Guidance · OrgOS 自己宣言（認証ではない）",
    "",
  ].join("\n");
  writeFileSync(path, `${text.trimEnd()}\n${addition}\n`, "utf-8");
}

function skeletonMissionVisionFromCompany(name: string): string {
  return `# ミッション · ビジョン · バリュー — ${name}

**正本:** \`data/plans/business-plan.yaml\`（本ファイルは叙述ミラー）  
**ISO 37000:** purpose 証拠（P-01）

## ミッション（Mission）

（人間が確定）

## ビジョン（Vision）

（人間が確定）

## バリュー（Values）

- 説明責任
`;
}

function nextReviewDate(cycle: "annual" | "biennial"): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + (cycle === "biennial" ? 2 : 1));
  return d.toISOString().slice(0, 10);
}

export function initIso37000SelfDeclaration(opts?: { force?: boolean }): {
  declaration_path: string;
  markdown_path: string;
  status: GovernancePrinciplesStatus;
} {
  const declPath = iso37000SelfDeclarationPath();
  if (existsSync(declPath) && !opts?.force) {
    throw new Error(`既に宣言があります: ${ISO37000_DECLARATION_REL}（上書きは --force）`);
  }

  mkdirSync(dirname(join(getTenantDir(), ISO37000_APPLICABILITY_REL)), { recursive: true });
  const policySrc = join(getInstallRoot(), "steward/standards/iso/ISO-37000/policy-template.md");
  const policyDest = join(getTenantDir(), "docs/compliance/iso/ISO-37000/governance-policy.md");
  mkdirSync(dirname(policyDest), { recursive: true });
  if (!existsSync(policyDest) && existsSync(policySrc)) {
    writeFileSync(policyDest, readFileSync(policySrc, "utf-8"), "utf-8");
  }
  const applicabilitySrc = join(
    getInstallRoot(),
    "steward/standards/iso/ISO-37000/templates/principles-applicability.md",
  );
  const applicabilityDest = join(getTenantDir(), ISO37000_APPLICABILITY_REL);
  if (!existsSync(applicabilityDest) && existsSync(applicabilitySrc)) {
    writeFileSync(applicabilityDest, readFileSync(applicabilitySrc, "utf-8"), "utf-8");
  }

  const govPolicyPath = join(getTenantDir(), "data/org/governance-policy.yaml");
  if (!existsSync(govPolicyPath)) {
    mkdirSync(dirname(govPolicyPath), { recursive: true });
    writeFileSync(
      govPolicyPath,
      'version: "1"\nauthority_profile: ceo_concentrated\nforbid_ceo_auditor_overlap: true\n',
      "utf-8",
    );
  }

  const mvDest = join(getTenantDir(), "docs/company/mission-vision.md");
  if (!existsSync(mvDest)) {
    try {
      writeFileSync(mvDest, skeletonMissionVisionFromCompany(loadCompany().name), "utf-8");
    } catch {
      writeFileSync(mvDest, skeletonMissionVisionFromCompany("（未設定）"), "utf-8");
    }
  }

  ensureIso37000EnabledInStandards();
  const status = assessGovernancePrinciples();

  let companyName: string | undefined;
  try {
    companyName = loadCompany().name;
  } catch {
    /* optional */
  }

  const assessedAt = new Date().toISOString();
  const decl = iso37000SelfDeclarationSchema.parse({
    schema_version: 1,
    standard: "ISO-37000",
    status: status.ready_for_self_declaration ? "ready" : "draft",
    company_name: companyName,
    signatory_role: "代表取締役",
    signed_at: null,
    review_cycle: "annual",
    notes:
      "ISO 37000 Guidance に基づく自己宣言ドラフト。第三者認証ではない。署名前に orgos governance principles status を確認。",
    last_assessment: {
      assessed_at: assessedAt,
      principles_ok: status.principles_ok,
      principles_total: status.principles_total,
      ready_for_self_declaration: status.ready_for_self_declaration,
    },
  });

  mkdirSync(dirname(declPath), { recursive: true });
  writeFileSync(declPath, YAML.stringify(decl), "utf-8");

  const mdPath = join(getTenantDir(), ISO37000_DECLARATION_MD_REL);
  mkdirSync(dirname(mdPath), { recursive: true });
  writeFileSync(mdPath, renderDeclarationMarkdown(decl, status), "utf-8");

  return {
    declaration_path: declPath,
    markdown_path: mdPath,
    status: assessGovernancePrinciples(),
  };
}

export function markIso37000SelfDeclared(opts: {
  signatoryName: string;
  signatoryRole?: string;
}): Iso37000SelfDeclaration {
  const status = assessGovernancePrinciples();
  if (!status.ready_for_self_declaration) {
    throw new Error(
      `自己宣言の前提が未充足です（${status.principles_ok}/${status.principles_total} · purpose=${status.purpose_ok} · applicability=${status.applicability_ok}）。先に evidence を揃えてください。`,
    );
  }
  const declPath = iso37000SelfDeclarationPath();
  if (!existsSync(declPath)) {
    throw new Error("宣言がありません。先に orgos governance principles init");
  }
  const current = iso37000SelfDeclarationSchema.parse(YAML.parse(readFileSync(declPath, "utf-8")));
  const next = iso37000SelfDeclarationSchema.parse({
    ...current,
    status: "self_declared",
    signatory_name: opts.signatoryName,
    signatory_role: opts.signatoryRole ?? current.signatory_role,
    signed_at: new Date().toISOString(),
    next_review: nextReviewDate(current.review_cycle ?? "annual"),
    last_assessment: {
      assessed_at: new Date().toISOString(),
      principles_ok: status.principles_ok,
      principles_total: status.principles_total,
      ready_for_self_declaration: true,
    },
  });
  writeFileSync(declPath, YAML.stringify(next), "utf-8");
  const mdPath = join(getTenantDir(), ISO37000_DECLARATION_MD_REL);
  writeFileSync(mdPath, renderDeclarationMarkdown(next, assessGovernancePrinciples()), "utf-8");
  return next;
}
