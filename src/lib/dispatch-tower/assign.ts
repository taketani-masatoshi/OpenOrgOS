import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../../schemas/classification.js";
import {
  towerPlanSchema,
  type TowerAssignment,
  type TowerClassification,
  type TowerPlan,
  type WorkKind,
} from "../../../schemas/dispatch-tower.js";
import { handoffSchema } from "../../../schemas/routing.js";
import { generateWorkOrderId, writeWorkOrderFiles } from "../escalate.js";
import { listActiveOperators } from "../org/operators.js";
import { listHandoffs } from "../routing.js";
import { getTenantId } from "../tenant.js";
import { currentDate, getDataDir } from "../utils.js";
import { buildTowerInventory } from "./inventory.js";

const PLAN_TTL_MS = 15 * 60_000;

function plansDir(): string {
  const dir = join(getDataDir(), "chat", "tower-plans");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function planPath(planId: string): string {
  return join(plansDir(), `${planId}.json`);
}

export function saveTowerPlan(plan: TowerPlan): void {
  writeFileSync(planPath(plan.plan_id), JSON.stringify(plan, null, 2), "utf-8");
}

export function loadTowerPlan(planId: string): TowerPlan | null {
  const path = planPath(planId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    const plan = towerPlanSchema.parse(raw);
    if (plan.expires_at && Date.parse(plan.expires_at) < Date.now()) {
      unlinkSync(path);
      return null;
    }
    return plan;
  } catch {
    return null;
  }
}

function addDays(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextFriday(from = currentDate()): string {
  const d = new Date(`${from}T12:00:00Z`);
  const day = d.getUTCDay();
  const delta = day <= 5 ? 5 - day : 7 - day + 5;
  d.setUTCDate(d.getUTCDate() + (delta === 0 ? 7 : delta));
  return d.toISOString().slice(0, 10);
}

export function parseDueDateFromMessage(message: string): string | undefined {
  const n = message.normalize("NFKC");
  if (/今日|本日/u.test(n)) return currentDate();
  if (/明日/u.test(n)) return addDays(currentDate(), 1);
  if (/金曜/u.test(n)) return nextFriday();
  const iso = n.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1]!;
  return undefined;
}

function hasTags(employeeTags: string[], required: string[]): boolean {
  if (required.length === 0) return true;
  return required.every((t) => employeeTags.includes(t));
}

export function proposeHumanAssignee(requiredTags: string[]): {
  assignee_employee_id?: string;
  assignee_operator_id?: string;
  needs_ceo_pick?: boolean;
  candidate_employee_ids?: string[];
} {
  const inventory = buildTowerInventory();
  const candidates = inventory.humans.filter((h) => hasTags(h.tags, requiredTags));
  if (candidates.length === 0) {
    const fallback = [...inventory.humans].sort((a, b) => a.open_cards - b.open_cards);
    return {
      needs_ceo_pick: true,
      candidate_employee_ids: fallback.slice(0, 5).map((h) => h.employee_id),
    };
  }
  const sorted = [...candidates].sort((a, b) => a.open_cards - b.open_cards);
  const pick = sorted[0]!;
  return {
    assignee_employee_id: pick.employee_id,
    assignee_operator_id: pick.operator_id,
  };
}

export function buildTowerAssignment(
  classification: TowerClassification,
  message: string
): TowerAssignment {
  const work_kind = classification.kind as WorkKind;
  const due = parseDueDateFromMessage(message);

  if (work_kind === "fact_live") {
    return { work_kind };
  }

  if (work_kind === "judgment") {
    return { work_kind, judgment_only: true };
  }

  if (work_kind === "aia_draft") {
    return {
      work_kind,
      to_agent: classification.owner_agent ?? ("secretary" as AgentId),
      due_date: due,
    };
  }

  if (work_kind === "fact_gap" || work_kind === "human_act") {
    const human = proposeHumanAssignee(classification.required_tags ?? []);
    return {
      work_kind,
      blocked_on: classification.blocked_on,
      due_date: due,
      assignee_employee_id: human.assignee_employee_id,
      assignee_operator_id: human.assignee_operator_id,
      needs_ceo_pick: human.needs_ceo_pick,
      candidate_employee_ids: human.candidate_employee_ids,
    };
  }

  return {
    work_kind: "unknown",
    needs_ceo_pick: true,
  };
}

function newPlanId(): string {
  return `tower-${Date.now().toString(36)}`;
}

export function buildTowerPlan(message: string, classification: TowerClassification): TowerPlan {
  const assignment = buildTowerAssignment(classification, message);
  return towerPlanSchema.parse({
    plan_id: newPlanId(),
    message,
    classification,
    assignment,
    status: "needs_confirmation",
    expires_at: new Date(Date.now() + PLAN_TTL_MS).toISOString(),
    reply_preview: formatTowerPlanPreview(message, classification, assignment),
  });
}

export function formatTowerPlanPreview(
  message: string,
  classification: TowerClassification,
  assignment: TowerAssignment
): string {
  const lines = [
    "**司令塔プラン（確認待ち）**",
    "",
    `種別: **${classification.kind}** (${classification.reason})`,
    `依頼: ${message.trim().slice(0, 200)}`,
  ];
  if (assignment.blocked_on) lines.push(`穴: \`${assignment.blocked_on}\``);
  if (assignment.assignee_employee_id) {
    lines.push(`宛先（人）: ${assignment.assignee_employee_id}`);
  }
  if (assignment.to_agent) lines.push(`宛先（AIA）: ${assignment.to_agent}`);
  if (assignment.due_date) lines.push(`期日: ${assignment.due_date}`);
  if (assignment.judgment_only) {
    lines.push("承認キュー（Wire / 稟議）から実行してください。");
  }
  if (assignment.needs_ceo_pick) {
    lines.push("候補が複数またはタグ不足 — CEO が宛先を選んでください。");
  }
  lines.push("", "起票する場合はカードで **実行** を押してください。");
  return lines.join("\n");
}

function listApproverOperatorIds(): string[] {
  return listActiveOperators()
    .filter((o) => o.role === "ceo" || o.role === "approver")
    .map((o) => o.operator_id);
}

export function validateTowerAssignment(assignment: TowerAssignment): string[] {
  const issues: string[] = [];
  if (assignment.work_kind === "fact_live" && assignment.due_date) {
    issues.push("fact_live cannot have due_date");
  }
  if (assignment.work_kind === "judgment" && assignment.to_agent) {
    issues.push("judgment cannot assign to AIA");
  }
  if (assignment.work_kind === "judgment" && assignment.assignee_employee_id) {
    issues.push("judgment uses approval queue, not human WO assignee");
  }
  return issues;
}

export interface TowerAssignResult {
  ok: boolean;
  error?: string;
  work_order_ids?: string[];
  plan?: TowerPlan;
}

export function executeTowerAssign(
  plan: TowerPlan,
  opts?: { assignee_employee_id?: string; due_date?: string }
): TowerAssignResult {
  const assignment = { ...plan.assignment };
  if (opts?.assignee_employee_id) {
    assignment.assignee_employee_id = opts.assignee_employee_id;
  }
  if (opts?.due_date) {
    assignment.due_date = opts.due_date;
  }

  const validation = validateTowerAssignment(assignment);
  if (validation.length) {
    return { ok: false, error: validation.join("; ") };
  }

  if (assignment.work_kind === "fact_live") {
    return { ok: false, error: "fact_live does not create work orders" };
  }

  if (assignment.judgment_only) {
    const approvers = listApproverOperatorIds();
    return {
      ok: true,
      plan: {
        ...plan,
        assignment,
        status: "executed",
        reply_preview: `承認キューを確認してください（approver: ${approvers.join(", ") || "none"})`,
      },
    };
  }

  if (assignment.work_kind === "aia_draft" && assignment.to_agent) {
    const id = generateWorkOrderId();
    const handoff = handoffSchema.parse({
      id,
      created_at: new Date().toISOString(),
      from_agent: "integration",
      to_agent: assignment.to_agent,
      mode: "implement",
      task_type: "implement",
      access: { allowed: true, reason: "dispatch tower aia draft" },
      context: { text: plan.message },
      status: "pending",
      subject: plan.message.slice(0, 120),
      requirements: plan.message,
      deliverables: [],
      acceptance_criteria: [],
      priority: "P2",
      tenant: getTenantId(),
      work_kind: assignment.work_kind,
      due_date: assignment.due_date,
    });
    writeWorkOrderFiles(handoff);
    return {
      ok: true,
      work_order_ids: [id],
      plan: {
        ...plan,
        assignment,
        status: "executed",
        work_order_ids: [id],
      },
    };
  }

  if (!assignment.assignee_employee_id && assignment.needs_ceo_pick) {
    return { ok: false, error: "assignee_employee_id required — pick a candidate" };
  }

  if (assignment.work_kind === "fact_gap" || assignment.work_kind === "human_act") {
    const id = generateWorkOrderId();
    const handoff = handoffSchema.parse({
      id,
      created_at: new Date().toISOString(),
      from_agent: "integration",
      to_agent: "integration",
      mode: "implement",
      task_type: "implement",
      access: { allowed: true, reason: "dispatch tower human card" },
      context: { text: plan.message },
      status: "pending",
      subject: plan.message.slice(0, 120),
      requirements: plan.message,
      deliverables: [],
      acceptance_criteria: [],
      priority: "P2",
      tenant: getTenantId(),
      work_kind: assignment.work_kind,
      assignee_employee_id: assignment.assignee_employee_id,
      assignee_operator_id: assignment.assignee_operator_id,
      due_date: assignment.due_date,
      blocked_on: assignment.blocked_on,
    });
    writeWorkOrderFiles(handoff);
    return {
      ok: true,
      work_order_ids: [id],
      plan: {
        ...plan,
        assignment,
        status: "executed",
        work_order_ids: [id],
      },
    };
  }

  return { ok: false, error: "unsupported tower assignment" };
}
