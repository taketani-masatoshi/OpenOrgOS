import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../../../schemas/classification.js";
import {
  agentMissionSchema,
  type AgentMission,
  type MissionType,
} from "../../../../schemas/agent-reporting.js";
import { getDocsReportsDir, currentDate, readYamlFile, writeYamlFile } from "../../utils.js";

export type { AgentMission } from "../../../../schemas/agent-reporting.js";

const MISSIONS_SUBDIR = join("agent-missions", "missions");

export function missionsDir(): string {
  return join(getDocsReportsDir(), MISSIONS_SUBDIR);
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
  /** Skip corrupt / schema-invalid YAML instead of throwing (UI / BFF paths). */
  skipInvalid?: boolean;
}): AgentMission[] {
  const dir = missionsDir();
  if (!existsSync(dir)) return [];
  const missions: AgentMission[] = [];
  for (const f of readdirSync(dir).filter((name) => name.endsWith(".yaml"))) {
    try {
      missions.push(readYamlFile(join(dir, f), agentMissionSchema));
    } catch (err) {
      if (filter?.skipInvalid) continue;
      throw err;
    }
  }
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
