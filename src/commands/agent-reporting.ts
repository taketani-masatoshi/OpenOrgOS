import type { AgentId } from "../../schemas/classification.js";
import {
  ackRelay,
  createAgentOrder,
  formatReportingInboxMarkdown,
  listCooRelayInbox,
  listMissions,
  listStewardInbox,
  submitAgentReport,
} from "../lib/agent-reporting.js";
import { setTenantId } from "../lib/tenant.js";
import { requireCliOperator } from "../lib/console-auth/cli-operator.js";

export interface AgentOrderOptions {
  tenant?: string;
  to: string;
  subject: string;
  from?: string;
  requirements?: string;
  workOrder?: string;
  json?: boolean;
}

export function runAgentOrder(opts: AgentOrderOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  requireCliOperator({ permission: "agent:order", command: "agent order" });
  const mission = createAgentOrder({
    toAgent: opts.to as AgentId,
    subject: opts.subject,
    fromActor: opts.from,
    requirements: opts.requirements,
    linkedWorkOrderId: opts.workOrder,
  });
  if (opts.json) {
    console.log(JSON.stringify(mission, null, 2));
    return;
  }
  console.log(`✓ ${mission.id} → ${mission.field_agent} (COO relay pending)`);
}

export interface AgentReportOptions {
  tenant?: string;
  agent: string;
  summary: string;
  mission?: string;
  path?: string;
  subject?: string;
  noAutoForward?: boolean;
  json?: boolean;
}

export function runAgentReport(opts: AgentReportOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  requireCliOperator({ permission: "agent:report", command: "agent report" });
  const mission = submitAgentReport({
    agentId: opts.agent as AgentId,
    summary: opts.summary,
    missionId: opts.mission,
    summaryPath: opts.path,
    missionSubject: opts.subject,
    autoForward: opts.noAutoForward ? false : undefined,
  });
  if (opts.json) {
    console.log(JSON.stringify(mission, null, 2));
    return;
  }
  console.log(
    `✓ report ${mission.id} · COO=${mission.relay.coo.status} · Steward=${mission.relay.steward.status}`
  );
}

export interface AgentRelayListOptions {
  tenant?: string;
  role: string;
  json?: boolean;
}

export function runAgentRelayList(opts: AgentRelayListOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const items = opts.role === "steward" ? listStewardInbox() : listCooRelayInbox();
  if (opts.json) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (items.length === 0) {
    console.log(`（${opts.role} inbox なし）`);
    return;
  }
  for (const m of items) {
    console.log(`${m.id}\t${m.field_agent}\t${m.status}\t${m.subject}`);
  }
}

export interface AgentRelayAckOptions {
  tenant?: string;
  mission: string;
  role: string;
  notes?: string;
  noForward?: boolean;
  json?: boolean;
}

export function runAgentRelayAck(opts: AgentRelayAckOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const mission = ackRelay({
    missionId: opts.mission,
    role: opts.role as "coo" | "steward",
    notes: opts.notes,
    forward: opts.role === "coo" ? !opts.noForward : undefined,
  });
  if (opts.json) {
    console.log(JSON.stringify(mission, null, 2));
    return;
  }
  console.log(`✓ ${mission.id} ack (${opts.role}) · Steward=${mission.relay.steward.status}`);
}

export function runAgentRelaySummary(): void {
  console.log(formatReportingInboxMarkdown());
}

export interface AgentMissionListOptions {
  tenant?: string;
  agent?: string;
  json?: boolean;
}

export function runAgentMissionList(opts: AgentMissionListOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const items = listMissions(opts.agent ? { fieldAgent: opts.agent as AgentId } : undefined);
  if (opts.json) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  for (const m of items.slice(0, 30)) {
    console.log(`${m.id}\t${m.field_agent}\t${m.type}\t${m.status}\t${m.subject}`);
  }
}
