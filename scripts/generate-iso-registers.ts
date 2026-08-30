#!/usr/bin/env node
/**
 * Instantiate HLS core requirement templates + one REQ per pack control,
 * and write records.yaml for templates + shared core evidence.
 *
 * Does not overwrite ISO-21401 (gold pack). Generated YAML is committed.
 *
 *   node --import tsx scripts/generate-iso-registers.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const ROOT = join(import.meta.dirname, "..");
const ISO_DIR = join(ROOT, "steward/standards/iso");
const SKIP = new Set(["ISO-21401"]);

const WORK_CONTROL: Record<string, string> = {
  scope: "CTL-CORE-scope",
  policy: "CTL-CORE-policy",
  risk_approach: "CTL-CORE-risk-approach",
  objectives_monitoring: "CTL-CORE-objectives-monitoring",
  competence: "CTL-CORE-competence",
  documented_information: "CTL-CORE-doc-control",
  operation: "CTL-CORE-operation",
  internal_audit: "CTL-CORE-internal-audit",
  management_review: "CTL-CORE-management-review",
  corrective_action: "CTL-CORE-corrective-action",
};

interface TemplateItem {
  letter: string;
  statement: string;
}
interface WorkTemplate {
  work: string;
  hls_hint?: string;
  items: TemplateItem[];
}

interface Binding {
  work: string;
  clause: string;
}
interface PackControl {
  id: string;
  title: string;
  iso_refs?: { clause?: string }[];
}

const HEADER_REQ = `# 要求事項レジスタ
#
# ⚠ statement は ISO 本文の転記ではなく、パック作成者による言い換えである。
#   ISO 本文は再配布できないため、規格票と突合するまで source: paraphrase・
#   verified_on 未記入のままとする。被覆検査の結果は「規格への網羅性」ではなく
#   「私たちが想定した要求事項への網羅性」である。
#
# 生成: node --import tsx scripts/generate-iso-registers.ts
# 検査: orgos iso requirements --iso {STANDARD}

`;

const HEADER_REC = `# 記録の内容仕様
#
# 証拠ファイルが「ある」ことと、その記録が要求事項を満たすことは別問題である。
# 語彙は閉じている（式言語は作らない）。ここで表現できない適合性は監査員の判断。
#
# 生成: node --import tsx scripts/generate-iso-registers.ts
# 検査: orgos iso records check --iso {STANDARD}

`;

function shortId(standard: string): string {
  return standard.replace(/^ISO-/, "");
}

function dump(doc: unknown): string {
  return YAML.stringify(doc, { lineWidth: 0, indent: 2 });
}

function matchHint(clause: string, hint?: string): boolean {
  if (!hint) return true;
  return clause === hint || clause.startsWith(hint);
}

function pickTemplates(templates: WorkTemplate[], work: string, clause: string): WorkTemplate[] {
  const forWork = templates.filter((t) => t.work === work);
  const hinted = forWork.filter((t) => t.hls_hint && matchHint(clause, t.hls_hint));
  if (hinted.length > 0) return hinted;
  const generic = forWork.filter((t) => !t.hls_hint);
  if (generic.length > 0) return generic;
  return forWork;
}

function loadPack(id: string): { bindings: Binding[]; controls: PackControl[] } {
  const raw = YAML.parse(readFileSync(join(ISO_DIR, id, "control-map.yaml"), "utf-8")) as {
    core_bindings?: Binding[];
    controls?: PackControl[];
  };
  return { bindings: raw.core_bindings ?? [], controls: raw.controls ?? [] };
}

function templateFiles(id: string): string[] {
  const dir = join(ISO_DIR, id, "templates");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => !f.startsWith(".") && !f.endsWith(".txt"));
}

function buildRequirements(
  standard: string,
  templates: WorkTemplate[],
  bindings: Binding[],
  controls: PackControl[],
): Record<string, unknown>[] {
  const reqs: Record<string, unknown>[] = [];
  const used = new Set<string>();
  const sid = shortId(standard);

  const push = (clause: string, letter: string, statement: string, controlIds: string[], note?: string) => {
    let L = letter;
    let id = `REQ-${sid}-${clause}-${L}`;
    while (used.has(id)) {
      L = String.fromCharCode(L.charCodeAt(0) + 1);
      id = `REQ-${sid}-${clause}-${L}`;
    }
    used.add(id);
    reqs.push({
      id,
      clause: String(clause),
      statement,
      source: "paraphrase",
      controls: controlIds,
      ...(note ? { note } : {}),
    });
  };

  if (standard === "ISO-37000") {
    for (const ctrl of controls) {
      const clause = ctrl.iso_refs?.[0]?.clause ?? ctrl.id.replace(/^CTL-37000-P-/, "P-");
      push(
        clause,
        "a",
        `${ctrl.title}。認証規格ではなく自己宣言の経路で適用する`,
        [ctrl.id],
        "guidance · self-declaration（ADR 0024）",
      );
      push(clause, "b", `${ctrl.title}の証拠を保持し、適用／除外を原則適用表に記録する`, [ctrl.id]);
    }
    return reqs;
  }

  const boundWorks = new Set(bindings.map((b) => b.work));
  for (const binding of bindings) {
    const controlId = WORK_CONTROL[binding.work];
    if (!controlId) continue;
    const groups = pickTemplates(templates, binding.work, binding.clause);
    for (const group of groups) {
      for (const item of group.items) {
        const extra =
          binding.work === "management_review" && item.letter === "b" && boundWorks.has("corrective_action")
            ? [controlId, "CTL-CORE-corrective-action"]
            : [controlId];
        push(binding.clause, item.letter, item.statement, extra);
      }
    }
  }

  if (boundWorks.has("management_review") && boundWorks.has("corrective_action")) {
    const mr = bindings.find((b) => b.work === "management_review");
    const ca = bindings.find((b) => b.work === "corrective_action");
    const clause = ca && /^\d/.test(ca.clause) && Number(ca.clause.split(".")[0]) >= 10 ? "10.3" : (mr?.clause ?? "10.3");
    push(
      clause,
      "a",
      "マネジメントシステムの適切性・妥当性・有効性を継続的に改善する",
      ["CTL-CORE-management-review", "CTL-CORE-corrective-action"],
    );
  }

  for (const ctrl of controls) {
    const clause = ctrl.iso_refs?.[0]?.clause ?? "domain";
    push(clause, "a", `${ctrl.title}を実施し、文書化した情報として保持する`, [ctrl.id]);
  }
  return reqs;
}

function csvSpec(
  file: string,
  title: string,
  columns: Record<string, unknown>[],
  rules: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { file, kind: "csv", title, columns, rules, ...extra };
}

function mdSpec(file: string, title: string, headings: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  const rules: Record<string, unknown>[] = [{ kind: "no_placeholders", message: "様式のプレースホルダが未置換です。" }];
  if (headings.length > 0) {
    rules.push({ kind: "required_sections", headings, message: "必須の節が欠けています。" });
  }
  return { file, kind: "markdown", title, rules, ...extra };
}

function yamlSpec(
  file: string,
  title: string,
  tenantPath: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    file,
    kind: "yaml",
    title,
    tenant_path: tenantPath,
    list_key: "entries",
    rules: [{ kind: "non_empty", message: `${title}に件が1件もありません。空の台帳は証拠ではありません。` }],
    ...extra,
  };
}

const CORRECTIVE_SPEC = csvSpec(
  "corrective-actions.csv",
  "不適合及び是正処置の記録",
  [
    { name: "id", required: true, pattern: "^CA-[0-9]{3}$" },
    { name: "raised_on", type: "date", required: true },
    { name: "source", required: true },
    { name: "description", required: true },
    { name: "immediate_action", required: true },
    { name: "status", required: true, values: ["open", "in_progress", "closed"] },
  ],
  [
    { kind: "unique", columns: ["id"], message: "是正処置の ID が重複しています。" },
    {
      kind: "conditional_required",
      column: "status",
      equals: ["open", "in_progress"],
      require: ["owner", "due"],
      message: "未完了の是正処置には責任者と期限が必要です。",
    },
    {
      kind: "conditional_required",
      column: "status",
      equals: ["closed"],
      require: ["root_cause", "corrective_action", "effectiveness_checked_on", "result"],
      message: "完了した是正処置には根本原因・是正処置・有効性確認日・結果が必要です。",
    },
    {
      kind: "comparison",
      left: "raised_on",
      operator: "lte",
      right: "effectiveness_checked_on",
      message: "有効性確認日が発生日より前になっています。",
    },
  ],
  { note: "10.2 相当。閉じた是正に有効性確認が無い行は通さない。" },
);

function coreRecords(standard: string, bindings: Binding[]): Record<string, unknown>[] {
  const works = new Set(bindings.map((b) => b.work));
  const out: Record<string, unknown>[] = [
    mdSpec("internal-audit-plan.md", "内部監査計画", ["適用範囲", "監査基準", "サンプリング方針"]),
    mdSpec("management-review.md", "マネジメントレビュー議事", ["インプット", "アウトプット", "決定事項"]),
  ];
  if (works.has("corrective_action") || standard === "ISO-27001") out.push(CORRECTIVE_SPEC);
  if (standard === "ISO-22000") {
    out.push(mdSpec("applicability.md", "適用範囲及び適用除外", ["適用範囲", "除外理由"]));
  }
  return out;
}

function specForTemplate(file: string): Record<string, unknown> | undefined {
  switch (file) {
    case "corrective-actions.csv":
      return CORRECTIVE_SPEC;
    case "nonconformance-log.csv":
      return csvSpec(
        file,
        "不適合な出力の記録",
        [
          { name: "nc_id", required: true },
          { name: "date", type: "date", required: true },
          { name: "source", required: true },
          { name: "description", required: true },
          { name: "status", required: false },
        ],
        [
          { kind: "non_empty", message: "不適合の記録が1件もありません。" },
          { kind: "unique", columns: ["nc_id"], message: "不適合 ID が重複しています。" },
        ],
      );
    case "risk-opportunities.csv":
      return csvSpec(
        file,
        "リスク及び機会の一覧",
        [
          { name: "id", required: true },
          { name: "date", type: "date" },
          { name: "process", required: true },
          { name: "risk_or_opportunity", required: true },
          { name: "action", required: true },
          { name: "owner", required: true },
          { name: "status", required: true },
        ],
        [
          { kind: "non_empty", message: "リスク及び機会が1件も登録されていません。" },
          { kind: "unique", columns: ["id"], message: "リスク及び機会の ID が重複しています。" },
        ],
      );
    case "quality-objectives.md":
      return mdSpec(file, "品質目標", ["目標一覧"]);
    case "risk-register.csv":
      return csvSpec(
        file,
        "情報セキュリティリスク登録簿",
        [
          { name: "risk_id", required: true },
          { name: "asset", required: true },
          { name: "threat", required: true },
          { name: "impact", required: true },
          { name: "likelihood", required: true },
          { name: "treatment", required: true },
          { name: "owner", required: true },
          { name: "status", required: true },
          { name: "review_date", type: "date" },
        ],
        [
          { kind: "non_empty", message: "リスクが1件も登録されていません。" },
          { kind: "unique", columns: ["risk_id"], message: "リスク ID が重複しています。" },
          {
            kind: "freshness",
            column: "review_date",
            max_age_days: 365,
            severity: "warning",
            message: "リスクの見直しから1年以上経過しています。",
          },
        ],
      );
    case "statement-of-applicability.md":
      return mdSpec(file, "適用宣言書（SoA）", []);
    case "principles-applicability.md":
      return mdSpec(file, "ISO 37000 原則適用表", []);
    case "contact-list.md":
      return mdSpec(file, "BCP 連絡網", []);
    default:
      return undefined;
  }
}

function domainRecords(standard: string): Record<string, unknown>[] {
  switch (standard) {
    case "ISO-9001":
      return [
        mdSpec("process-map.md", "プロセス及びその相互作用", ["プロセス一覧", "相互作用", "監視方法"]),
      ];
    case "ISO-27001":
      return [
        mdSpec("access-review.md", "アクセス権限のレビュー", ["対象システム", "レビュー結果", "是正"]),
      ];
    case "ISO-37000":
      return [
        mdSpec("oversight-log.md", "統治機関の監督記録", ["開催", "決議", "フォローアップ"]),
      ];
    case "ISO-13485":
      return [
        yamlSpec(
          "manufacturing-batch-records.yaml",
          "製造バッチ台帳",
          "data/medical-device/ledgers/manufacturing-batch-records.yaml",
        ),
        yamlSpec(
          "distribution-records.yaml",
          "出荷・トレーサビリティ台帳",
          "data/medical-device/ledgers/distribution-records.yaml",
        ),
        yamlSpec(
          "complaint-records.yaml",
          "苦情処理台帳",
          "data/medical-device/ledgers/complaint-records.yaml",
        ),
        yamlSpec(
          "adverse-event-records.yaml",
          "規制当局報告・不具合台帳",
          "data/medical-device/ledgers/adverse-event-records.yaml",
        ),
        yamlSpec(
          "document-control-records.yaml",
          "文書管理台帳",
          "data/medical-device/ledgers/document-control-records.yaml",
        ),
        yamlSpec(
          "training-records.yaml",
          "力量・教育訓練台帳",
          "data/medical-device/ledgers/training-records.yaml",
        ),
      ];
    case "ISO-14001":
      return [
        csvSpec(
          "environmental-aspects.csv",
          "環境側面の特定と著しさの評価",
          [
            { name: "id", required: true, pattern: "^EA-[0-9]{3}$" },
            { name: "activity", required: true },
            { name: "aspect", required: true },
            { name: "impact", required: true },
            { name: "severity", type: "number", required: true, min: 1, max: 5 },
            { name: "frequency", type: "number", required: true, min: 1, max: 5 },
            { name: "score", type: "number", required: true, min: 1, max: 25 },
            { name: "significant", required: true, values: ["yes", "no"] },
            { name: "reviewed_on", type: "date" },
          ],
          [
            { kind: "non_empty", message: "環境側面が1件も登録されていません。" },
            { kind: "unique", columns: ["id"], message: "環境側面の ID が重複しています。" },
            {
              kind: "computed",
              target: "score",
              operation: "product",
              factors: ["severity", "frequency"],
              message: "score が severity × frequency と一致しません。",
            },
            {
              kind: "conditional_required",
              column: "significant",
              equals: ["yes"],
              require: ["control", "objective"],
              message: "著しい環境側面には管理方法と目標が必要です。",
            },
          ],
        ),
        mdSpec("compliance-obligations.md", "順守義務", ["義務一覧", "評価方法", "最新の評価"]),
      ];
    case "ISO-45001":
      return [
        csvSpec(
          "hazard-register.csv",
          "危険源の特定及びリスク評価",
          [
            { name: "id", required: true, pattern: "^HZ-[0-9]{3}$" },
            { name: "activity", required: true },
            { name: "hazard", required: true },
            { name: "likelihood", type: "number", required: true, min: 1, max: 5 },
            { name: "severity", type: "number", required: true, min: 1, max: 5 },
            { name: "rating", type: "number", required: true, min: 1, max: 25 },
            { name: "status", required: true, values: ["open", "in_progress", "closed"] },
          ],
          [
            { kind: "non_empty", message: "危険源が1件も登録されていません。" },
            { kind: "unique", columns: ["id"], message: "危険源 ID が重複しています。" },
            {
              kind: "computed",
              target: "rating",
              operation: "product",
              factors: ["likelihood", "severity"],
              message: "rating が likelihood × severity と一致しません。",
            },
          ],
        ),
        mdSpec("worker-consultation.md", "働く人の協議及び参加", ["協議の場", "取り上げた事項", "反映"]),
      ];
    case "ISO-50001":
      return [
        csvSpec(
          "enpi-log.csv",
          "エネルギーパフォーマンス指標（EnPI）",
          [
            { name: "month", type: "month", required: true },
            { name: "energy_kwh", type: "number", required: true, min: 0 },
            { name: "output", type: "number", required: true, min: 0 },
            { name: "enpi", type: "number", required: true, min: 0 },
          ],
          [
            { kind: "non_empty", message: "EnPI の測定記録がありません。" },
            { kind: "unique", columns: ["month"], message: "同じ月の EnPI が重複しています。" },
          ],
        ),
        mdSpec("energy-review.md", "エネルギーレビュー", ["エネルギー使用", "ベースライン", "改善機会"]),
      ];
    case "ISO-22301":
      return [
        csvSpec(
          "bia-register.csv",
          "事業影響度分析（RTO/RPO）",
          [
            { name: "id", required: true, pattern: "^BIA-[0-9]{3}$" },
            { name: "activity", required: true },
            { name: "rto_hours", type: "number", required: true, min: 0 },
            { name: "rpo_hours", type: "number", required: true, min: 0 },
            { name: "owner", required: true },
            { name: "reviewed_on", type: "date" },
          ],
          [
            { kind: "non_empty", message: "事業影響度分析が1件もありません。" },
            { kind: "unique", columns: ["id"], message: "BIA ID が重複しています。" },
            {
              kind: "comparison",
              left: "rpo_hours",
              operator: "lte",
              right: "rto_hours",
              message: "RPO が RTO を超えています。",
            },
          ],
        ),
        mdSpec("bc-plan.md", "事業継続計画", ["発動基準", "復旧手順", "演習"]),
      ];
    case "ISO-20000":
      return [
        mdSpec("sla-register.md", "サービスレベル管理", ["対象サービス", "目標", "実績"]),
        csvSpec(
          "incident-log.csv",
          "インシデント管理",
          [
            { name: "id", required: true },
            { name: "opened_on", type: "date", required: true },
            { name: "description", required: true },
            { name: "status", required: true, values: ["open", "in_progress", "closed"] },
          ],
          [
            { kind: "non_empty", message: "インシデント記録がありません。" },
            { kind: "unique", columns: ["id"], message: "インシデント ID が重複しています。" },
            {
              kind: "conditional_required",
              column: "status",
              equals: ["closed"],
              require: ["closed_on", "resolution"],
              message: "クローズしたインシデントには完了日と解決内容が必要です。",
            },
          ],
        ),
      ];
    case "ISO-37001":
      return [
        csvSpec(
          "bribery-risk.csv",
          "贈収賄リスク評価",
          [
            { name: "id", required: true, pattern: "^BR-[0-9]{3}$" },
            { name: "activity", required: true },
            { name: "likelihood", type: "number", required: true, min: 1, max: 5 },
            { name: "impact", type: "number", required: true, min: 1, max: 5 },
            { name: "rating", type: "number", required: true, min: 1, max: 25 },
            { name: "treatment", required: true },
            { name: "owner", required: true },
          ],
          [
            { kind: "non_empty", message: "贈収賄リスクが1件も登録されていません。" },
            { kind: "unique", columns: ["id"], message: "リスク ID が重複しています。" },
            {
              kind: "computed",
              target: "rating",
              operation: "product",
              factors: ["likelihood", "impact"],
              message: "rating が likelihood × impact と一致しません。",
            },
          ],
        ),
        mdSpec("whistleblowing.md", "通報窓口", ["受付経路", "独立性", "調査手順"]),
      ];
    case "ISO-22000":
      return [];
    default:
      return [];
  }
}

function mergeRecords(parts: Record<string, unknown>[][]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const part of parts) {
    for (const rec of part) {
      const file = String(rec.file);
      if (seen.has(file)) continue;
      seen.add(file);
      out.push(rec);
    }
  }
  return out;
}

function extraDomainReqs(standard: string, controls: PackControl[]): Record<string, unknown>[] {
  const sid = shortId(standard);
  const extra: Record<string, unknown>[] = [];
  const byId = new Map(controls.map((c) => [c.id, c]));
  const add = (ctrlId: string, letter: string, statement: string) => {
    const ctrl = byId.get(ctrlId);
    if (!ctrl) return;
    const clause = ctrl.iso_refs?.[0]?.clause ?? "domain";
    extra.push({
      id: `REQ-${sid}-${clause}-${letter}`,
      clause: String(clause),
      statement,
      source: "paraphrase",
      controls: [ctrlId],
    });
  };
  if (standard === "ISO-9001") {
    add("CTL-9001-4.4", "b", "プロセスの監視・測定及び必要な変更を行う");
    add("CTL-9001-8.7", "b", "不適合な出力の識別・隔離・是正の記録を保持する");
  }
  if (standard === "ISO-27001") {
    add("CTL-27001-6.2", "b", "適用宣言書で選択した管理策と除外理由を維持する");
    add("CTL-27001-A.8.1", "b", "アクセス権限を定期にレビューし、不要な権限を除去する");
  }
  if (standard === "ISO-14001") {
    add("CTL-14001-6.1.2", "b", "著しい環境側面の決定基準を定め、適用する");
    add("CTL-14001-6.1.3", "b", "順守義務を特定し、最新の状態に保つ");
  }
  if (standard === "ISO-45001") {
    add("CTL-45001-6.1.2", "b", "危険源に対するリスク及び機会への取組みを計画する");
    add("CTL-45001-5.4", "b", "協議の結果を文書化した情報として保持する");
  }
  if (standard === "ISO-50001") {
    add("CTL-50001-6.4", "b", "EnPI をエネルギーレビューの結果と一貫した方法で算出する");
    add("CTL-50001-6.5", "b", "エネルギーベースラインを文書化し、重大な変化時に見直す");
  }
  if (standard === "ISO-22301") {
    add("CTL-22301-8.2.2", "b", "RTO と RPO を文書化し、定期に見直す");
    add("CTL-22301-8.5", "b", "演習の結果を記録し、計画を更新する");
  }
  if (standard === "ISO-20000") {
    add("CTL-20000-8.3.3", "b", "SLA の実績を監視し、未達を記録する");
    add("CTL-20000-8.6.1", "b", "インシデントの優先度付けとエスカレーションを行う");
  }
  if (standard === "ISO-37001") {
    add("CTL-37001-4.5", "b", "贈収賄リスク評価を定期に見直し、結果を保持する");
    add("CTL-37001-8.9", "b", "通報を受けた事案を秘密に調査し、結果を記録する");
  }
  if (standard === "ISO-13485") {
    add("CTL-13485-7.5", "b", "製造バッチを識別し、出荷まで追跡できる記録を保持する");
    add("CTL-13485-8.2.2", "b", "苦情を調査し、是正が必要かを評価する");
    add("CTL-13485-8.2.3", "b", "規制報告の要否を判断し、報告した場合は記録を保持する");
  }
  return extra;
}

function writePack(standard: string, templates: WorkTemplate[]): void {
  const { bindings, controls } = loadPack(standard);
  const reqs = [
    ...buildRequirements(standard, templates, bindings, controls),
    ...extraDomainReqs(standard, controls),
  ];
  const reqPath = join(ISO_DIR, standard, "requirements.yaml");
  const reqDoc = {
    version: "1",
    standard,
    requirements: reqs,
  };
  writeFileSync(reqPath, HEADER_REQ.replaceAll("{STANDARD}", standard) + dump(reqDoc), "utf-8");

  const fromTemplates = templateFiles(standard)
    .map((f) => specForTemplate(f))
    .filter((s): s is Record<string, unknown> => s !== undefined);
  const records = mergeRecords([coreRecords(standard, bindings), fromTemplates, domainRecords(standard)]);
  const recPath = join(ISO_DIR, standard, "records.yaml");
  const recDoc = { version: "1", standard, records };
  writeFileSync(recPath, HEADER_REC.replaceAll("{STANDARD}", standard) + dump(recDoc), "utf-8");
  console.log(`${standard}: requirements ${reqs.length} · records ${records.length}`);
}

function main(): void {
  const file = YAML.parse(readFileSync(join(ISO_DIR, "core/requirement-templates.yaml"), "utf-8")) as {
    templates: WorkTemplate[];
  };
  const packs = readdirSync(ISO_DIR)
    .filter((n) => n.startsWith("ISO-") && existsSync(join(ISO_DIR, n, "control-map.yaml")))
    .filter((n) => !SKIP.has(n))
    .sort();
  mkdirSync(join(ISO_DIR, "core/templates"), { recursive: true });
  for (const id of packs) writePack(id, file.templates);
}

main();
