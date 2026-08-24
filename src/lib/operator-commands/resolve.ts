import { randomBytes } from "node:crypto";
import {
  commandCatalogEntrySchema,
  commandPlanSchema,
  type CommandCatalogEntry,
  type CommandCandidate,
  type CommandPlan,
} from "../../../schemas/operator-commands.js";
import type { OperatorPermission } from "../../../schemas/org/operator.js";
import type { SkillRunOptions } from "../../commands/skills.js";
import {
  getChatEnabledSkills,
  getSkillById,
  type ResolvedSkillEntry,
} from "../skill-registry.js";
import { matchRoutes, type MatchedRoute } from "../routing.js";
import { isHumanApprovalSkill } from "../skill-execution-mode.js";
import { parseTenantConfigProposeIntent } from "../steward-chat/tenant-config-intent.js";

const AMBIGUOUS_SCORE_DELTA = 8;

export interface ResolveCommandOptions {
  message: string;
  permissions?: OperatorPermission[];
  /** Prefer a specific skill when choosing among ambiguous candidates. */
  skillId?: string;
  /** Override / merge args after deterministic parse. */
  args?: Record<string, string | number | boolean | null>;
}

function newPlanId(): string {
  return `cmd-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

function formatCliDisplay(
  skill: ResolvedSkillEntry,
  args: Record<string, string | number | boolean | null>
): string {
  const cmd = skill.cli_command ?? skill.id;
  const parts = [`orgos skills run ${cmd}`];
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "boolean") {
      if (value) parts.push(`--${key}`);
      continue;
    }
    parts.push(`--${key}`, String(value));
  }
  return parts.join(" ");
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Deterministic argument extraction from natural-language message. */
export function parseCommandArgsFromMessage(
  message: string,
  skill: ResolvedSkillEntry
): Record<string, string | number | boolean | null> {
  const args: Record<string, string | number | boolean | null> = {};
  const defs = skill.chat?.args ?? [];
  const text = message.trim();

  const monthMatch = text.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])\b/);
  const month =
    monthMatch
      ? `${monthMatch[1]}-${monthMatch[2]}`
      : /今月|this\s*month/i.test(text)
        ? currentMonth()
        : /先月|last\s*month/i.test(text)
          ? shiftMonth(currentMonth(), -1)
          : undefined;

  const idMatch = text.match(/\b((?:IMP|HO|NOTICE|APR)-\d{8}-[A-Za-z0-9]+)\b/);
  const daysMatch = text.match(/(\d+)\s*日/);
  const amountMatch = text.match(/[¥￥]?([\d,]+)\s*円/);

  for (const def of defs) {
    if (def.type === "month" && month) args[def.name] = month;
    if (def.type === "id" && idMatch) args[def.name] = idMatch[1]!;
    if (def.type === "number" && def.name === "days" && daysMatch) {
      args[def.name] = Number(daysMatch[1]);
    }
    if (def.type === "number" && def.name === "amount" && amountMatch) {
      args[def.name] = Number(amountMatch[1]!.replace(/,/g, ""));
    }
    if (def.name === "body" && def.type === "string" && text) {
      args.body = text;
    }
    if (def.name === "all" && def.type === "boolean" && /全部|すべて|all\b/i.test(text)) {
      args.all = true;
    }
  }

  if (skill.id === "tenant_config_propose") {
    const parsed = parseTenantConfigProposeIntent(text);
    if (parsed) {
      args.target = parsed.target;
      args.id = parsed.targetId;
      args.enabled = parsed.enabled;
      args.body = text;
    } else {
      args.body = text;
    }
  }

  // Skills without explicit chat.args still benefit from common parses.
  if (!defs.length) {
    if (month) args.month = month;
    if (idMatch) args.id = idMatch[1]!;
  }

  return args;
}

export function missingRequiredArgs(
  skill: ResolvedSkillEntry,
  args: Record<string, string | number | boolean | null>
): string[] {
  const fromChat = (skill.chat?.args ?? [])
    .filter((a) => a.required)
    .map((a) => a.name)
    .filter((name) => {
      const v = args[name];
      return v === undefined || v === null || v === "";
    });
  const fromSkill = (skill.required_options ?? []).filter((name) => {
    const v = args[name];
    return v === undefined || v === null || v === "";
  });
  return [...new Set([...fromChat, ...fromSkill])];
}

function toCandidate(matched: MatchedRoute, skill: ResolvedSkillEntry): CommandCandidate {
  return {
    skill_id: skill.id,
    label: skill.chat?.label ?? skill.description,
    cli_display: formatCliDisplay(skill, {}),
    kind: skill.chat!.kind,
    permission: skill.chat!.permission,
    score: matched.score,
    matched_by: matched.matchedBy,
  };
}

function hasPermission(
  permissions: OperatorPermission[] | undefined,
  required: OperatorPermission
): boolean {
  if (!permissions) return true;
  return permissions.includes(required);
}

export function listCommandCatalog(
  permissions?: OperatorPermission[]
): CommandCatalogEntry[] {
  return getChatEnabledSkills()
    .filter((s) => s.chat && hasPermission(permissions, s.chat.permission))
    .map((s) =>
      commandCatalogEntrySchema.parse({
        skill_id: s.id,
        label: s.chat!.label,
        description: s.description,
        cli_command: s.cli_command,
        kind: s.chat!.kind,
        permission: s.chat!.permission,
        args: (s.chat!.args ?? []).map((a) => ({
          name: a.name,
          type: a.type,
          required: a.required,
        })),
      })
    )
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

function buildPlanBase(): Pick<CommandPlan, "plan_id" | "created_at" | "expires_at"> {
  const created = new Date();
  const expires = new Date(created.getTime() + 15 * 60_000);
  return {
    plan_id: newPlanId(),
    created_at: created.toISOString(),
    expires_at: expires.toISOString(),
  };
}

function finalizePlan(
  skill: ResolvedSkillEntry,
  matched: MatchedRoute | undefined,
  message: string,
  permissions: OperatorPermission[] | undefined,
  overrideArgs?: Record<string, string | number | boolean | null>
): CommandPlan {
  const base = buildPlanBase();
  const chat = skill.chat!;
  if (!hasPermission(permissions, chat.permission)) {
    return commandPlanSchema.parse({
      ...base,
      status: "forbidden",
      skill_id: skill.id,
      label: chat.label,
      kind: chat.kind,
      permission: chat.permission,
      message: `permission required: ${chat.permission}`,
    });
  }

  const parsed = parseCommandArgsFromMessage(message, skill);
  const args = { ...parsed, ...(overrideArgs ?? {}) };
  const missing = missingRequiredArgs(skill, args);
  const cli_display = formatCliDisplay(skill, args);
  const candidate = matched
    ? toCandidate(matched, skill)
    : {
        skill_id: skill.id,
        label: chat.label,
        cli_display,
        kind: chat.kind,
        permission: chat.permission,
        score: 0,
        matched_by: [],
      };

  if (chat.kind === "approval" || isHumanApprovalSkill(skill.id)) {
    return commandPlanSchema.parse({
      ...base,
      status: "approval_gate",
      skill_id: skill.id,
      label: chat.label,
      cli_display,
      kind: "approval",
      permission: chat.permission,
      args,
      missing_args: missing,
      candidates: [candidate],
      message: "This operation requires an explicit human approval gate (Wire / broker / org approval UI).",
    });
  }

  if (missing.length) {
    return commandPlanSchema.parse({
      ...base,
      status: "needs_args",
      skill_id: skill.id,
      label: chat.label,
      cli_display,
      kind: chat.kind,
      permission: chat.permission,
      args,
      missing_args: missing,
      candidates: [candidate],
      message: `missing required options: ${missing.join(", ")}`,
    });
  }

  if (chat.kind === "write") {
    return commandPlanSchema.parse({
      ...base,
      status: "needs_confirmation",
      skill_id: skill.id,
      label: chat.label,
      cli_display,
      kind: chat.kind,
      permission: chat.permission,
      args,
      missing_args: [],
      candidates: [candidate],
      message: "Confirm to run this write command",
    });
  }

  return commandPlanSchema.parse({
    ...base,
    status: "ready",
    skill_id: skill.id,
    label: chat.label,
    cli_display,
    kind: chat.kind,
    permission: chat.permission,
    args,
    missing_args: [],
    candidates: [candidate],
  });
}

/**
 * Resolve a chat message to a CommandPlan using routing registry + chat-enabled skills.
 */
export function resolveCommandPlan(opts: ResolveCommandOptions): CommandPlan {
  const message = opts.message.trim();
  const base = buildPlanBase();
  if (!message) {
    return commandPlanSchema.parse({
      ...base,
      status: "not_found",
      message: "empty message",
    });
  }

  if (opts.skillId) {
    const skill = getSkillById(opts.skillId);
    if (!skill?.chat?.enabled) {
      return commandPlanSchema.parse({
        ...base,
        status: "not_found",
        message: `skill not chat-enabled: ${opts.skillId}`,
      });
    }
    return finalizePlan(skill, undefined, message, opts.permissions, opts.args);
  }

  const matches = matchRoutes({ text: message }).filter((m) => {
    if (!m.route.skill) return false;
    // Agent folder access / roster inactive must not hide chat-enabled skills;
    // operator RBAC is enforced later via chat.permission.
    if (!m.skillAvailable) return false;
    const skill = getSkillById(m.route.skill);
    return Boolean(skill?.chat?.enabled);
  });

  if (!matches.length) {
    return commandPlanSchema.parse({
      ...base,
      status: "not_found",
      message: "no chat-enabled command matched",
    });
  }

  const top = matches[0]!;
  const second = matches[1];
  if (second && top.score - second.score < AMBIGUOUS_SCORE_DELTA) {
    const candidates = matches.slice(0, 5).flatMap((m) => {
      const skill = getSkillById(m.route.skill!);
      return skill?.chat?.enabled ? [toCandidate(m, skill)] : [];
    });
    return commandPlanSchema.parse({
      ...base,
      status: "ambiguous",
      candidates,
      message: "multiple commands matched — choose one",
    });
  }

  const skill = getSkillById(top.route.skill!)!;
  return finalizePlan(skill, top, message, opts.permissions, opts.args);
}

export function argsToSkillRunOptions(
  args: Record<string, string | number | boolean | null>
): SkillRunOptions {
  const out: SkillRunOptions = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}
