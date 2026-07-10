import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import {
  agentMissionSchema,
  chainPolicySchema,
  type AgentMission,
  type ChainPolicy,
  type MissionType,
  type OrderSource,
} from "../../schemas/agent-reporting.js";
import type { Handoff } from "../../schemas/routing.js";
import { appendAuditEvent } from "./audit-log.js";
import { ensureAgentWorkspace } from "./agent-workspace.js";
import { pushQueueEvent } from "./queue-db.js";
import { STEWARD_AGENTS_DIR } from "./steward-paths.js";
import { getTenantId } from "./tenant.js";
import { currentDate, getDocsReportsDir, loadRegistryFile, readYamlFile, writeYamlFile } from "./utils.js";
import { assertActiveTenant, assertIntraOrgAgentTarget } from "./org-boundary.js";

export const CHAIN_POLICY_PATH = join("steward", "core", "reporting", "chain-policy.yaml");
const MISSIONS_SUBDIR = join("agent-missions", "missions");

export function loadChainPolicy(): ChainPolicy {
  return loadRegistryFile(join(STEWARD_AGENTS_DIR, "..", "reporting", "chain-policy.yaml"), chainPolicySchema, () =>
    chainPolicySchema.parse({
      version: "1.0",
      hub_agent: "coo",
      executive_agent: "executive_steward",
      excluded_from_field: ["executive_steward", "coo"],
      auto_forward_pulse: true,
      auto_forward_work_order_complete: true,
    })
  );
}

export function missionsDir(): string {
  return join(getDocsReportsDir(), MISSIONS_SUBDIR);
}

export function isFieldAgent(agentId: AgentId): boolean {
  const policy = loadChainPolicy();
  return !policy.excluded_from_field.includes(agentId);
}

export function reportingHubAgent(): AgentId {
  return loadChainPolicy().hub_agent;
}

export function reportingExecutiveAgent(): AgentId {
  return loadChainPolicy().executive_agent;
}

export function generateMissionId(): string {
  const date = currentDate().replace(/-/g, "");
  const prefix = `MS-${date}-`;
  const dir = missionsDir();
  let max = 0;
  if (existsSync(dir)) {
    const existing = readdirSync(dir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".yaml"))
      .map((f) => parseInt(f.slice(prefix.length, f.length - ".yaml".length), 10))
      .filter((n) => !Number.isNaN(n));
    max = existing.length ? Math.max(...existing) : 0;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function missionPath(id: string): string {
  return join(missionsDir(), `${id}.yaml`);
}

export function writeMission(mission: AgentMission): string {
  const path = missionPath(mission.id);
  writeYamlFile(path, mission);
  return path;
}

export function loadMission(id: string): AgentMission {
  return readYamlFile(missionPath(id), agentMissionSchema);
}

export function listMissions(filter?: {
  fieldAgent?: AgentId;
  status?: AgentMission["status"];
  type?: MissionType;
}): AgentMission[] {
  const dir = missionsDir();
  if (!existsSync(dir)) return [];
  const missions = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => readYamlFile(join(dir, f), agentMissionSchema));
  return missions
    .filter((m) => {
      if (filter?.fieldAgent && m.field_agent !== filter.fieldAgent) return false;
      if (filter?.status && m.status !== filter.status) return false;
      if (filter?.type && m.type !== filter.type) return false;
      return true;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function findMissionByWorkOrder(workOrderId: string): AgentMission | undefined {
  return listMissions().find((m) => m.order?.linked_work_order_id === workOrderId);
}

export function listCooRelayInbox(): AgentMission[] {
  return listMissions().filter((m) => {
    if (m.relay.coo.status !== "pending") return false;
    if (m.report) return true;
    return m.type === "order" && (m.status === "ordered" || m.status === "in_progress");
  });
}

export function listStewardInbox(): AgentMission[] {
  return listMissions().filter((m) => m.relay.steward.status === "pending" && m.report);
}

export interface CreateAgentOrderOptions {
  toAgent: AgentId;
  subject: string;
  fromActor?: string;
  source?: OrderSource;
  requirements?: string;
  linkedWorkOrderId?: string;
  tenant?: string;
}

export function createAgentOrder(opts: CreateAgentOrderOptions): AgentMission {
  assertIntraOrgAgentTarget(opts.toAgent, "agent order");
  if (!isFieldAgent(opts.toAgent)) {
    throw new Error(`${opts.toAgent} is not a field agent (reports via COO)`);
  }

  ensureAgentWorkspace(opts.toAgent);

  const tenant = opts.tenant ?? getTenantId();
  assertActiveTenant(tenant, "agent order");
  const mission = agentMissionSchema.parse({
    version: 1,
    id: generateMissionId(),
    created_at: new Date().toISOString(),
    tenant,
    type: "order",
    status: "ordered",
    field_agent: opts.toAgent,
    subject: opts.subject,
    order: {
      from_actor: opts.fromActor ?? "executive_steward",
      source: opts.source ?? "cli",
      requirements: opts.requirements,
      linked_work_order_id: opts.linkedWorkOrderId,
    },
    relay: {
      coo: { status: "pending" },
      steward: { status: "pending" },
    },
  });

  writeMission(mission);
  pushQueueEvent({
    type: "agent_mission_created",
    ref: mission.id,
    payload: { field_agent: mission.field_agent, subject: mission.subject },
    tenant,
  });
  appendAuditEvent({
    event: "escalate",
    ref: mission.id,
    actor: mission.order?.from_actor,
    detail: `agent-order:${mission.field_agent}:${mission.subject.slice(0, 60)}`,
  });
  return mission;
}

export interface SubmitAgentReportOptions {
  agentId: AgentId;
  summary: string;
  missionId?: string;
  summaryPath?: string;
  missionSubject?: string;
  type?: MissionType;
  autoForward?: boolean;
  tenant?: string;
  linkedWorkOrderId?: string;
}

function forwardCooToSteward(mission: AgentMission, notes?: string): AgentMission {
  const now = new Date().toISOString();
  const updated = agentMissionSchema.parse({
    ...mission,
    relay: {
      coo: {
        status: "forwarded",
        ack_at: now,
        notes: notes ?? "auto-forward",
      },
      steward: { status: "pending" },
    },
  });
  writeMission(updated);
  pushQueueEvent({
    type: "agent_relay_coo",
    ref: updated.id,
    payload: { field_agent: updated.field_agent },
    tenant: updated.tenant,
  });
  return updated;
}

export function submitAgentReport(opts: SubmitAgentReportOptions): AgentMission {
  if (!isFieldAgent(opts.agentId)) {
    throw new Error(`${opts.agentId} is not a field agent`);
  }

  const tenant = opts.tenant ?? getTenantId();
  const now = new Date().toISOString();
  let mission: AgentMission;

  if (opts.missionId) {
    mission = loadMission(opts.missionId);
    if (mission.field_agent !== opts.agentId) {
      throw new Error(`mission ${opts.missionId} belongs to ${mission.field_agent}, not ${opts.agentId}`);
    }
    mission = agentMissionSchema.parse({
      ...mission,
      status: "completed",
      type: mission.type === "order" ? "report" : mission.type,
      report: {
        summary: opts.summary,
        summary_path: opts.summaryPath,
        submitted_at: now,
      },
      relay: {
        coo: { status: "pending" },
        steward: mission.relay.steward,
      },
    });
  } else {
    mission = agentMissionSchema.parse({
      version: 1,
      id: generateMissionId(),
      created_at: now,
      tenant,
      type: opts.type ?? "report",
      status: "completed",
      field_agent: opts.agentId,
      subject: opts.missionSubject ?? opts.summary.slice(0, 80),
      ...(opts.linkedWorkOrderId
        ? {
            order: {
              from_actor: "work_order",
              source: "work_order" as const,
              linked_work_order_id: opts.linkedWorkOrderId,
            },
          }
        : {}),
      report: {
        summary: opts.summary,
        summary_path: opts.summaryPath,
        submitted_at: now,
      },
      relay: {
        coo: { status: "pending" },
        steward: { status: "pending" },
      },
    });
  }

  writeMission(mission);
  pushQueueEvent({
    type: "agent_report_submitted",
    ref: mission.id,
    payload: { field_agent: mission.field_agent, summary_path: opts.summaryPath },
    tenant,
  });

  const policy = loadChainPolicy();
  const shouldAutoForward =
    opts.autoForward ??
    ((opts.type === "pulse_report" && policy.auto_forward_pulse) ||
      (opts.type === "work_order_complete" && policy.auto_forward_work_order_complete));

  if (shouldAutoForward) {
    mission = forwardCooToSteward(mission, "auto-forward");
  }

  return mission;
}

export interface AckRelayOptions {
  missionId: string;
  role: "coo" | "steward";
  notes?: string;
  forward?: boolean;
}

export function ackRelay(opts: AckRelayOptions): AgentMission {
  const mission = loadMission(opts.missionId);
  const now = new Date().toISOString();

  if (opts.role === "coo") {
    if (mission.relay.coo.status !== "pending") {
      throw new Error(`COO relay for ${opts.missionId} is already ${mission.relay.coo.status}`);
    }
    const updated = agentMissionSchema.parse({
      ...mission,
      relay: {
        coo: {
          status: opts.forward === false ? "ack" : "forwarded",
          ack_at: now,
          notes: opts.notes,
        },
        steward:
          opts.forward === false
            ? mission.relay.steward
            : { status: "pending", notes: opts.notes },
      },
    });
    writeMission(updated);
    pushQueueEvent({
      type: "agent_relay_coo",
      ref: updated.id,
      payload: { field_agent: updated.field_agent, forward: opts.forward !== false },
      tenant: updated.tenant,
    });
    return updated;
  }

  if (mission.relay.steward.status !== "pending") {
    throw new Error(`Steward inbox for ${opts.missionId} is already ${mission.relay.steward.status}`);
  }
  const updated = agentMissionSchema.parse({
    ...mission,
    relay: {
      ...mission.relay,
      steward: { status: "ack", ack_at: now, notes: opts.notes },
    },
  });
  writeMission(updated);
  pushQueueEvent({
    type: "agent_relay_steward",
    ref: updated.id,
    payload: { field_agent: updated.field_agent },
    tenant: updated.tenant,
  });
  return updated;
}

export function relayPulseReport(agentId: AgentId, summaryPath: string): AgentMission | null {
  if (!isFieldAgent(agentId)) return null;
  const policy = loadChainPolicy();
  return submitAgentReport({
    agentId,
    summary: `Agent pulse summary · ${agentId}`,
    summaryPath,
    missionSubject: `${agentId} pulse ${currentDate()}`,
    type: "pulse_report",
    autoForward: policy.auto_forward_pulse,
  });
}

export function createMissionFromWorkOrder(handoff: Handoff): AgentMission | null {
  if (handoff.task_type !== "implement") return null;
  if (!isFieldAgent(handoff.to_agent as AgentId)) return null;
  const existing = findMissionByWorkOrder(handoff.id);
  if (existing) return existing;

  return createAgentOrder({
    toAgent: handoff.to_agent as AgentId,
    subject: handoff.subject ?? handoff.requirements?.slice(0, 80) ?? handoff.id,
    fromActor: handoff.from_agent,
    source: "work_order",
    requirements: handoff.requirements,
    linkedWorkOrderId: handoff.id,
    tenant: handoff.tenant,
  });
}

export function relayWorkOrderComplete(handoff: Handoff, notes?: string): AgentMission | null {
  if (!isFieldAgent(handoff.to_agent as AgentId)) return null;
  const policy = loadChainPolicy();
  let linked = findMissionByWorkOrder(handoff.id);
  if (!linked) {
    linked = createMissionFromWorkOrder(handoff) ?? undefined;
  }
  const missionId =
    linked && linked.field_agent === handoff.to_agent ? linked.id : undefined;

  return submitAgentReport({
    agentId: handoff.to_agent as AgentId,
    missionId,
    summary: notes ?? handoff.completion_notes ?? `Work order ${handoff.id} completed`,
    missionSubject: handoff.subject ?? handoff.id,
    type: "work_order_complete",
    autoForward: policy.auto_forward_work_order_complete,
    tenant: handoff.tenant,
    linkedWorkOrderId: handoff.id,
  });
}

export function formatReportingInboxMarkdown(): string {
  const coo = listCooRelayInbox().slice(0, 10);
  const steward = listStewardInbox().slice(0, 10);
  const lines = [
    "## Agent 報告チェーン",
    "",
    `**COO 中継待ち:** ${listCooRelayInbox().length} 件 · **Steward inbox:** ${listStewardInbox().length} 件`,
    "",
    "### COO relay",
    "",
  ];

  if (coo.length === 0) {
    lines.push("（なし）");
  } else {
    for (const m of coo) {
      lines.push(
        `- **${m.id}** · ${m.field_agent} · ${m.subject}${m.report ? " · 報告あり" : " · 依頼追跡"}`
      );
    }
  }

  lines.push("", "### Steward inbox", "");
  if (steward.length === 0) {
    lines.push("（なし）");
  } else {
    for (const m of steward) {
      lines.push(`- **${m.id}** · ${m.field_agent} · ${m.subject}`);
    }
  }

  lines.push(
    "",
    "```bash",
    "npm run orgos -- agent relay list --role coo",
    "npm run orgos -- agent relay ack --mission MS-... --role steward",
    "```",
    ""
  );

  return lines.join("\n");
}
