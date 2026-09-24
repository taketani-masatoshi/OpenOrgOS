/**
 * Light queue counters shared by maturity / executive home (avoid double heavy builds).
 * Path: src/lib/ops-lane-counts.ts
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listCorrespondenceDrafts } from "./correspondence/draft.js";
import { listTriageEntries } from "./correspondence/mail-triage-queue.js";
import { loadPeersRegistry } from "./protocol/transport/peers.js";
import { listWirePending } from "./protocol/transport/wire-queue.js";
import { buildPropertyOpsDashboard } from "./property-ops/build-dashboard.js";
import { buildTaskView } from "./tasks/task-view.js";
import { getTenantDir } from "./tenant.js";

export type OpsLaneCounts = {
  mail: number;
  drafts: number;
  tasks_open: number;
  tasks_p0: number;
  candidates: number;
  asana_mirrored: number;
  property_due_p0: number;
  property_count: number;
  property_signals: string[];
  wire_pending: number;
  peers_count: number;
  peers_present: boolean;
  workbench_ok: boolean;
  tasks_ok: boolean;
  property_ok: boolean;
  wire_ok: boolean;
};

export function collectOpsLaneCounts(): OpsLaneCounts {
  const out: OpsLaneCounts = {
    mail: 0,
    drafts: 0,
    tasks_open: 0,
    tasks_p0: 0,
    candidates: 0,
    asana_mirrored: 0,
    property_due_p0: 0,
    property_count: 0,
    property_signals: [],
    wire_pending: 0,
    peers_count: 0,
    peers_present: false,
    workbench_ok: false,
    tasks_ok: false,
    property_ok: false,
    wire_ok: false,
  };

  try {
    out.mail = listTriageEntries({ unprocessed: true, limit: 50 }).filter(
      (e) => e.disposition !== "spam",
    ).length;
    // Real draft count for maturity signals (not a display cap).
    out.drafts = listCorrespondenceDrafts().length;
    out.workbench_ok = true;
  } catch {
    out.workbench_ok = false;
  }

  try {
    const view = buildTaskView();
    out.tasks_open = view.counts.open;
    out.tasks_p0 = view.counts.p0;
    out.candidates = view.candidates.length;
    out.asana_mirrored = view.tasks.filter((t) => t.links?.asana_task_gid).length;
    out.tasks_ok = true;
  } catch {
    out.tasks_ok = false;
  }

  try {
    const dash = buildPropertyOpsDashboard();
    out.property_count = dash.properties.length;
    out.property_due_p0 = dash.properties.reduce((s, p) => s + p.due_p0, 0);
    out.property_signals = dash.properties.map((p) => `${p.property_id}:${p.due_p0}`);
    out.property_ok = true;
  } catch {
    out.property_ok = false;
  }

  try {
    const peersPath = join(getTenantDir(), "data", "protocol", "peers.yaml");
    out.peers_present = existsSync(peersPath);
    out.peers_count = loadPeersRegistry().peers.length;
    out.wire_pending = listWirePending().length;
    out.wire_ok = true;
  } catch {
    out.wire_ok = false;
  }

  return out;
}
