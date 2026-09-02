/**
 * Deterministic L1 hire / onboarding — append employees.yaml only.
 * Contract / payroll / social insurance stay human + Work Order.
 * Path: src/lib/hr/onboard.ts
 */
import { join } from "node:path";
import {
  employeeSchema,
  employeesFileSchema,
  type Employee,
} from "../../../schemas/hr.js";
import { loadCompany, loadEmployees } from "../data.js";
import { runEscalation } from "../escalate.js";
import { getTenantId } from "../tenant.js";
import { formatStewardOrchestrateCeoReply } from "../steward-chat/steward-orchestrate-intent.js";
import { getDataDir, writeYamlFile } from "../utils.js";
import { runValidateReport } from "../../commands/validate.js";

export const ONBOARD_CHECKLIST = [
  "雇用契約書の制定・締結（CTR · 人間承認）",
  "給与連携: data/finance/payroll.yaml（Finance 協調 · 金額は人間）",
  "力量マップ / 研修（data/hr/competence.yaml · training.yaml）",
  "従業員名簿・賃金台帳・出勤簿（docs/company/hr/records/ · Git 非追跡）",
  "雇用保険・社会保険の届出（該当時 · 社外手続）",
  "マイナンバーは本リポジトリに保存しない",
] as const;

export type HrOnboardParse = {
  name: string;
  hired_date?: string;
};

export type HrOnboardPlan = {
  employee_id: string;
  name: string;
  hired_date?: string;
  status: "active";
  already_on_roster: boolean;
  existing_id?: string;
  checklist: readonly string[];
  will_file_work_orders: Array<"human_resources" | "finance">;
};

export type HrOnboardApplyResult = {
  ok: boolean;
  plan: HrOnboardPlan;
  wrote: boolean;
  work_order_ids: string[];
  root_id?: string;
  validate_ok?: boolean;
  reply: string;
  error?: string;
};

const ONBOARD_HINT =
  /入社した|入社し|入社手続|入社手続き|雇用を開始|新規採用|オンボ|onboard|new\s*hire|joined|hire/iu;

const ACTION_HINT = /進めて|手続|手続き|お願い|してほしい|してくれ|登録|名簿|追加/iu;

function normalize(message: string): string {
  return message.normalize("NFKC").trim();
}

/** Extract display name from CEO phrasing (L1 only). */
export function parseHrOnboardName(message: string): string | undefined {
  const n = normalize(message);
  const patterns = [
    /名前は\s*([^\s。、,.]{2,40}?)(?:さん|様|氏)?(?:です|だ)?/,
    /氏名は\s*([^\s。、,.]{2,40}?)(?:さん|様|氏)?(?:です|だ)?/,
    /([^\s。、,.]{2,20})さん(?:が|を|の)?(?:入社|雇用|採用)/,
    /(?:社員|従業員|人)\s*([^\s。、,.]{2,20})(?:さん)?(?:が|を)?\s*入社/,
  ];
  for (const re of patterns) {
    const m = n.match(re);
    let name = m?.[1]?.replace(/(?:さん|様|氏)$/u, "").trim();
    if (name) {
      // Trim trailing particles accidentally captured
      name = name.replace(/(?:です|だ)$/u, "").trim();
    }
    if (name && name.length >= 2 && name.length <= 40) return name;
  }
  return undefined;
}

export function parseHrOnboardHiredDate(message: string): string | undefined {
  const n = normalize(message);
  const iso = n.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const jp = n.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (jp) {
    return `${jp[1]}-${String(Number(jp[2])).padStart(2, "0")}-${String(Number(jp[3])).padStart(2, "0")}`;
  }
  return undefined;
}

export function isHrOnboardIntent(message: string): boolean {
  const n = normalize(message);
  if (!n) return false;
  if (!ONBOARD_HINT.test(n) && !(/入社/.test(n) && ACTION_HINT.test(n))) return false;
  return Boolean(parseHrOnboardName(n)) || ACTION_HINT.test(n);
}

export function parseHrOnboardIntent(message: string): HrOnboardParse | null {
  if (!isHrOnboardIntent(message)) return null;
  const name = parseHrOnboardName(message);
  if (!name) return null;
  const hired_date = parseHrOnboardHiredDate(message);
  return hired_date ? { name, hired_date } : { name };
}

function nextEmployeeId(existing: Employee[]): string {
  let max = 0;
  for (const e of existing) {
    const m = e.id.match(/^EMP-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EMP-${String(max + 1).padStart(3, "0")}`;
}

function findByName(employees: Employee[], name: string): Employee | undefined {
  const key = name.normalize("NFKC").trim();
  return employees.find((e) => e.name.normalize("NFKC").trim() === key);
}

export function buildHrOnboardPlan(input: HrOnboardParse): HrOnboardPlan {
  const file = loadEmployees();
  const existing = findByName(file.employees, input.name);
  const employee_id = existing?.id ?? nextEmployeeId(file.employees);
  return {
    employee_id,
    name: input.name.trim(),
    hired_date: input.hired_date,
    status: "active",
    already_on_roster: Boolean(existing),
    existing_id: existing?.id,
    checklist: ONBOARD_CHECKLIST,
    will_file_work_orders: existing ? ["human_resources"] : ["human_resources", "finance"],
  };
}

export function formatHrOnboardPlanMarkdown(plan: HrOnboardPlan): string {
  const lines = [
    "## 入社手続き（確認）",
    "",
    plan.already_on_roster
      ? `名簿に既に ${plan.employee_id} があります。残作業の Work Order のみ起票します。`
      : `名簿へ追加予定: **${plan.employee_id}** · status active${plan.hired_date ? ` · hired_date ${plan.hired_date}` : ""}`,
    "",
    "自動では行わないこと（人間確認）:",
    ...plan.checklist.map((c) => `- ${c}`),
    "",
    `確認後: employees.yaml の L1 追記（未登録時）+ Work Order（${plan.will_file_work_orders.join(" · ")}）`,
  ];
  return lines.join("\n");
}

function employeesPath(): string {
  return join(getDataDir(), "hr", "employees.yaml");
}

export function applyHrOnboardRoster(plan: HrOnboardPlan): { wrote: boolean } {
  if (plan.already_on_roster) return { wrote: false };
  const file = loadEmployees();
  const next = employeeSchema.parse({
    id: plan.employee_id,
    name: plan.name,
    hired_date: plan.hired_date ?? null,
    status: "active",
  });
  const updated = employeesFileSchema.parse({
    ...file,
    employees: [...file.employees, next],
  });
  writeYamlFile(employeesPath(), updated);
  return { wrote: true };
}

function fileOnboardWorkOrders(
  plan: HrOnboardPlan,
  rosterLabel: string,
  opts?: { fromAgent?: string }
): { work_order_ids: string[]; root_id?: string; agentIds: string[] } {
  const company = loadCompany();
  const fromAgent = opts?.fromAgent ?? "executive_steward";
  const checklistBlock = plan.checklist.map((c) => `- [ ] ${c}`).join("\n");
  const requirements = [
    `入社残作業（EMP id: ${plan.employee_id}）`,
    `名簿 L1: ${rosterLabel}`,
    "",
    "チェックリスト:",
    checklistBlock,
    "",
    "給与額・契約本文・マイナンバーはチャットに出さない。",
  ].join("\n");

  const hr = runEscalation({
    fromAgent,
    tenant: getTenantId(),
    input: {
      subject: `入社残作業 ${plan.employee_id}（人事）`,
      background: `Steward Chat 入社オンボ（${company.name}）`,
      requirements,
      path: "data/hr/",
      text: `人事 入社手続き ${plan.employee_id} ${requirements}`,
      priority: "P2",
      tenant: getTenantId(),
    },
  });

  const ids = hr.workOrders.map((w) => w.id);
  const agents = (
    hr.workOrders.filter((w) => w.parent_id).length
      ? hr.workOrders.filter((w) => w.parent_id)
      : hr.workOrders
  ).map((w) => w.to_agent);

  if (plan.will_file_work_orders.includes("finance")) {
    const fin = runEscalation({
      fromAgent,
      tenant: getTenantId(),
      input: {
        subject: `入社給与連携 ${plan.employee_id}（財務）`,
        background: `Steward Chat 入社オンボ（${company.name}）· payroll 連携`,
        requirements: [
          `EMP id: ${plan.employee_id} を payroll.yaml へ連携（金額は人間確定）。`,
          "口座番号等の L2 はチャットに出さない。",
        ].join("\n"),
        path: "data/finance/payroll.yaml",
        text: `財務 給与連携 payroll ${plan.employee_id}`,
        priority: "P2",
        tenant: getTenantId(),
      },
    });
    ids.push(...fin.workOrders.map((w) => w.id));
    agents.push(
      ...(fin.workOrders.filter((w) => w.parent_id).length
        ? fin.workOrders.filter((w) => w.parent_id)
        : fin.workOrders
      ).map((w) => w.to_agent)
    );
  }

  return {
    work_order_ids: ids,
    root_id: hr.parent?.id ?? hr.workOrders[0]?.id ?? ids[0],
    agentIds: agents,
  };
}

export function applyHrOnboard(
  input: HrOnboardParse,
  opts?: { fromAgent?: string; write?: boolean }
): HrOnboardApplyResult {
  const plan = buildHrOnboardPlan(input);
  if (!opts?.write) {
    return {
      ok: true,
      plan,
      wrote: false,
      work_order_ids: [],
      reply: formatHrOnboardPlanMarkdown(plan),
    };
  }

  try {
    const { wrote } = applyHrOnboardRoster(plan);
    const validate = runValidateReport({});
    const wos = fileOnboardWorkOrders(plan, wrote ? "追加済" : "既存", {
      fromAgent: opts.fromAgent,
    });
    const reply = [
      wrote
        ? `名簿に ${plan.employee_id} を追加しました。`
        : `名簿の ${plan.employee_id} は既に登録済みです。`,
      formatStewardOrchestrateCeoReply({
        ok: wos.work_order_ids.length > 0,
        rootId: wos.root_id,
        agentIds: wos.agentIds.length ? wos.agentIds : ["human_resources"],
      }),
      "",
      "契約・給与額・社保は未完了です。進捗は実行状況、結果は委譲と回答で確認してください。",
    ].join("\n");

    return {
      ok: wos.work_order_ids.length > 0,
      plan,
      wrote,
      work_order_ids: wos.work_order_ids,
      root_id: wos.root_id,
      validate_ok: validate.ok,
      reply,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      plan,
      wrote: false,
      work_order_ids: [],
      reply: `入社手続きを適用できませんでした: ${reason}`,
      error: reason,
    };
  }
}
