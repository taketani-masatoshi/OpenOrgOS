import { daysUntil, isModuleEnabled, loadModuleDataFile } from "../../../../src/lib/module-business-data.js";
import {
  eventOpsEventsFileSchema,
  eventOpsRunOfShowFileSchema,
} from "../../../../schemas/business-modules.js";

export const MODULE_ID = "event_operations";

export function runEventOperationsShow(opts: { json?: boolean }): void {
  const events = loadModuleDataFile(MODULE_ID, "events.yaml", eventOpsEventsFileSchema);
  const upcoming =
    events?.data.events.filter(
      (e) => e.status !== "completed" && e.status !== "cancelled" && daysUntil(e.date) >= 0
    ) ?? [];
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    events: events?.data.events.length ?? 0,
    upcoming: upcoming.length,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# event_operations\n`);
  console.log(`events: ${summary.events} · upcoming: ${summary.upcoming}`);
}

export function runEventOperationsValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  if (!loadModuleDataFile(MODULE_ID, "events.yaml", eventOpsEventsFileSchema)) {
    issues.push("events.yaml missing");
  }
  const ros = loadModuleDataFile(MODULE_ID, "run_of_show.yaml", eventOpsRunOfShowFileSchema);
  const events = loadModuleDataFile(MODULE_ID, "events.yaml", eventOpsEventsFileSchema);
  if (ros && events) {
    const eventIds = new Set(events.data.events.map((e) => e.id));
    for (const seg of ros.data.run_of_show) {
      if (!eventIds.has(seg.event_id)) issues.push(`run_of_show: unknown event_id ${seg.event_id}`);
    }
  }
  if (issues.length) {
    console.error("✗ event_operations:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ event_operations — events OK");
}

export function runEventOperationsAction(_opts: Record<string, unknown>): void {
  const events = loadModuleDataFile(MODULE_ID, "events.yaml", eventOpsEventsFileSchema);
  const ros = loadModuleDataFile(MODULE_ID, "run_of_show.yaml", eventOpsRunOfShowFileSchema);
  if (!events) {
    console.error("events.yaml not found");
    process.exit(1);
  }
  console.log("# Upcoming runbook\n");
  for (const e of events.data.events) {
    if (e.status === "completed" || e.status === "cancelled") continue;
    if (daysUntil(e.date) < 0) continue;
    const segments = ros?.data.run_of_show.filter((s) => s.event_id === e.id) ?? [];
    console.log(`\n## ${e.id} ${e.name} · ${e.date} (${daysUntil(e.date)}d) · ${e.status}`);
    if (segments.length) {
      for (const block of segments) {
        if (block.items?.length) {
          for (const item of block.items) {
            console.log(`  - ${item.time} ${item.activity}${item.owner ? ` · ${item.owner}` : ""}`);
          }
        } else if (block.start_time && block.segment) {
          console.log(`  - ${block.start_time} ${block.segment}${block.owner ? ` · ${block.owner}` : ""}`);
        }
      }
    } else {
      console.log("  - (no run_of_show segments — add run_of_show.yaml)");
    }
  }
}
