import { existsSync } from "node:fs";
import { join } from "node:path";
import { calendarFileSchema, tasksFileSchema } from "../../schemas/executive.js";
import {
  detectCalendarConflicts,
  filterEventsInRange,
  formatEventLine,
  requireExecutiveCalendar,
  weekRange,
  openTasks,
  upcomingOneOnOnes,
} from "../lib/executive-calendar.js";
import { loadExecutiveCalendar, loadExecutiveTasks, loadOneOnOnes } from "../lib/data.js";
import { pushCalendarToGoogle } from "../lib/google-calendar-push.js";
import { pullCalendarFromGoogle, yamlOnlyFutureEvents } from "../lib/google-calendar-pull.js";
import { currentDate, writeMarkdownReport, writeYamlFile, getExecutiveDir } from "../lib/utils.js";
import { auditCliMutation, requireCliDataWrite } from "../lib/console-auth/cli-operator.js";

export async function runExecutiveCalendarPush(opts: {
  from?: string;
  to?: string;
  dryRun?: boolean;
  meet?: boolean;
  json?: boolean;
}): Promise<void> {
  const calPath = join(getExecutiveDir(), "calendar.yaml");
  if (!existsSync(calPath)) {
    console.error("data/executive/calendar.yaml 未作成");
    process.exit(1);
  }

  const file = loadExecutiveCalendar();
  const range = opts.from && opts.to ? { from: opts.from, to: opts.to } : weekRange();
  const { result, events } = await pushCalendarToGoogle(file.events, {
    from: opts.from ?? range.from,
    to: opts.to ?? range.to,
    dryRun: opts.dryRun,
    addMeet: opts.meet ?? true,
  });

  if (!opts.dryRun && (result.created > 0 || result.updated > 0)) {
    requireCliDataWrite({ command: "executive calendar push", permission: "escalate:plan" });
    writeYamlFile(calPath, calendarFileSchema.parse({ ...file, events }));
    auditCliMutation("executive calendar push", `${result.created}+${result.updated}`);
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(
    `# Calendar push ${opts.dryRun ? "(dry-run)" : ""}\n\n` +
      `created: ${result.created} · updated: ${result.updated} · skipped: ${result.skipped}`
  );
  for (const e of result.events) {
    console.log(`  ${e.id} → ${e.action}${e.googleEventId ? ` (${e.googleEventId})` : ""}`);
  }
  if (opts.dryRun) {
    console.log(
      "\n.env: GOOGLE_CALENDAR_ID · GOOGLE_CALENDAR_ACCESS_TOKEN — [google-calendar-setup.md]"
    );
  }
}

export async function runExecutiveCalendarPull(opts: {
  since?: string;
  dryRun?: boolean;
  apply?: boolean;
  json?: boolean;
}): Promise<void> {
  const calPath = join(getExecutiveDir(), "calendar.yaml");
  if (!existsSync(calPath)) {
    console.error("data/executive/calendar.yaml 未作成");
    process.exit(1);
  }

  const since = opts.since ?? currentDate();
  const file = loadExecutiveCalendar();
  const dryRun = opts.apply ? false : opts.dryRun !== false;
  const { result, events } = await pullCalendarFromGoogle(file.events, { since, dryRun });
  const yamlOnly = yamlOnlyFutureEvents(file.events, since);

  if (!dryRun && result.linked > 0) {
    requireCliDataWrite({ command: "executive calendar pull", permission: "escalate:plan" });
    writeYamlFile(calPath, calendarFileSchema.parse({ ...file, events }));
    auditCliMutation("executive calendar pull", String(result.linked));
  }

  if (opts.json) {
    console.log(JSON.stringify({ ...result, yamlOnly: yamlOnly.map((e) => e.id) }, null, 2));
    return;
  }

  console.log(`# Calendar pull since ${since} ${dryRun ? "(dry-run)" : ""}\n`);
  console.log(
    `linked google_event_id: ${result.linked} · external (Google only): ${result.external}`
  );
  if (result.linkedEvents.length) {
    console.log("\n## Linked");
    for (const e of result.linkedEvents) {
      console.log(`  ${e.yamlId} ← ${e.googleEventId}`);
    }
  }
  if (result.externalEvents.length) {
    console.log("\n## Google-only（YAML 手動反映候補）");
    for (const e of result.externalEvents.slice(0, 20)) {
      console.log(`  ${e.start} ${e.summary} (${e.googleEventId})`);
    }
  }
  if (yamlOnly.length) {
    console.log(`\n## YAML-only（push 未同期 · ${yamlOnly.length} 件）`);
    for (const e of yamlOnly.slice(0, 10)) {
      console.log(`  ${formatEventLine(e)}`);
    }
  }
}

export function runExecutiveCalendarList(opts: {
  from?: string;
  to?: string;
  json?: boolean;
}): void {
  const events = requireExecutiveCalendar();
  const range = opts.from && opts.to ? { from: opts.from, to: opts.to } : weekRange();
  const from = opts.from ?? range.from;
  const to = opts.to ?? range.to;
  const filtered = filterEventsInRange(events, from, to);

  if (opts.json) {
    console.log(JSON.stringify({ from, to, count: filtered.length, events: filtered }, null, 2));
    return;
  }

  console.log(`# 予定 ${from} — ${to} (${filtered.length} 件)\n`);
  if (filtered.length === 0) {
    console.log("（予定なし）");
    return;
  }
  for (const e of filtered) {
    console.log(formatEventLine(e));
  }
}

export function runExecutiveCalendarConflicts(opts: { json?: boolean }): void {
  const events = requireExecutiveCalendar();
  const conflicts = detectCalendarConflicts(events);

  if (opts.json) {
    console.log(JSON.stringify({ count: conflicts.length, conflicts }, null, 2));
    if (conflicts.length) process.exit(1);
    return;
  }

  console.log(`# カレンダー競合 (${conflicts.length} 件)\n`);
  if (conflicts.length === 0) {
    console.log("✓ 競合なし");
    return;
  }
  for (const c of conflicts) {
    console.log(`- ${c.a.id} × ${c.b.id}（${c.overlapMinutes} 分重複）`);
    console.log(`  · ${formatEventLine(c.a)}`);
    console.log(`  · ${formatEventLine(c.b)}`);
  }
  process.exit(1);
}

export function buildExecutiveBriefMarkdown(referenceDate = currentDate()): string {
  const { from, to } = weekRange(referenceDate);
  const lines: string[] = [
    `# 社長週次ブリーフ ${referenceDate}`,
    "",
    `> 生成: \`steward executive brief\` · 期間: ${from} — ${to} · データ: data/executive/`,
    "",
    "## 今週の予定",
    "",
  ];

  const calPath = join(getExecutiveDir(), "calendar.yaml");
  if (existsSync(calPath)) {
    const events = filterEventsInRange(requireExecutiveCalendar(), from, to);
    if (events.length === 0) {
      lines.push("（予定なし）");
    } else {
      lines.push("| 日付 | 時間 | 件名 | 種別 | 状態 |");
      lines.push("|------|------|------|------|------|");
      for (const e of events) {
        const start = e.start.includes("T") ? e.start.slice(11, 16) : "—";
        const end = e.end.includes("T") ? e.end.slice(11, 16) : "—";
        lines.push(
          `| ${e.start.slice(0, 10)} | ${start}–${end} | ${e.title} | ${e.type} | ${e.status} |`
        );
      }
    }
  } else {
    lines.push("（calendar.yaml 未作成）");
  }

  lines.push("", "## 要対応タスク（open / in_progress）", "");
  const tasksPath = join(getExecutiveDir(), "tasks.yaml");
  if (existsSync(tasksPath)) {
    const tasks = openTasks(loadExecutiveTasks().tasks).slice(0, 10);
    if (tasks.length === 0) {
      lines.push("（未完了タスクなし）");
    } else {
      lines.push("| ID | タイトル | 期限 | 優先度 | 状態 |");
      lines.push("|----|---------|------|--------|------|");
      for (const t of tasks) {
        lines.push(`| ${t.id} | ${t.title} | ${t.due ?? "—"} | ${t.priority} | ${t.status} |`);
      }
    }
  } else {
    lines.push("（tasks.yaml 未作成）");
  }

  lines.push("", "## 1-on-1（14 日以内）", "");
  const oooPath = join(getExecutiveDir(), "one-on-ones.yaml");
  if (existsSync(oooPath)) {
    const upcoming = upcomingOneOnOnes(loadOneOnOnes().one_on_ones);
    if (upcoming.length === 0) {
      lines.push("（該当なし）");
    } else {
      lines.push("| 相手 | 次回日 | 議題（先頭） |");
      lines.push("|------|--------|-------------|");
      for (const o of upcoming) {
        lines.push(`| ${o.person} | ${o.next_date ?? "—"} | ${o.topics[0] ?? "—"} |`);
      }
    }
  } else {
    lines.push("（one-on-ones.yaml 未作成）");
  }

  lines.push(
    "",
    "## メモ",
    "",
    "- 財務数値・契約金額は含めない（Executive Steward は dashboard 経由）",
    "- 下書き待ち: docs/executive/correspondence-drafts/ を確認",
    ""
  );
  return lines.join("\n");
}

export function runExecutiveTasksArchive(opts: { dryRun?: boolean }): void {
  const tasksPath = join(getExecutiveDir(), "tasks.yaml");
  if (!existsSync(tasksPath)) {
    console.error("data/executive/tasks.yaml 未作成");
    process.exit(1);
  }
  const file = loadExecutiveTasks();
  let count = 0;
  const tasks = file.tasks.map((t) => {
    if (t.status === "cancelled") {
      count++;
      return { ...t, status: "archived" as const };
    }
    return t;
  });
  if (count === 0) {
    console.log("✓ cancelled タスクなし — 移行不要");
    return;
  }
  if (opts.dryRun) {
    console.log(`(dry-run) ${count} 件 cancelled → archived`);
    return;
  }
  requireCliDataWrite({ command: "executive tasks archive", permission: "escalate:plan" });
  writeYamlFile(tasksPath, tasksFileSchema.parse({ ...file, tasks }));
  auditCliMutation("executive tasks archive", String(count));
  console.log(`✓ ${count} 件を archived に移行（Secretary 一覧から非表示）`);
}

export function runExecutiveBrief(opts: {
  output?: string;
  markdown?: boolean;
  referenceDate?: string;
}): void {
  const content = buildExecutiveBriefMarkdown(opts.referenceDate ?? currentDate());
  const save = opts.markdown !== false;
  if (save) {
    requireCliDataWrite({ command: "executive brief", permission: "agent:report" });
    const filename = opts.output ?? `weekly-brief-${currentDate()}.md`;
    const path = writeMarkdownReport("executive-brief", filename, content);
    auditCliMutation("executive brief", filename);
    console.log(`✓ ${path}`);
  } else {
    console.log(content);
  }
}
