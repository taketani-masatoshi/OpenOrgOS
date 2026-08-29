#!/usr/bin/env node
/**
 * Today digest 用 macOS 通知（スタイル正本: macos-notify.ts）
 *
 * Usage:
 *   node --import tsx scripts/macos-today-notify.ts --slot 1300 --summary "判断 2 件 · ..."
 */
import {
  buildTodayDigestNotification,
  displayMacOSNotification,
} from "../src/lib/notifications/macos-notify.js";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

const slot = argValue("--slot") ?? new Date().toTimeString().slice(0, 5).replace(":", "");
const summary = argValue("--summary") ?? "Today を更新しました";

const input = buildTodayDigestNotification({ slot, summary });
const ok = await displayMacOSNotification(input);
process.stdout.write(
  ok
    ? `✓ macos notify · ${input.title} / ${input.subtitle ?? "-"}\n`
    : `⚠ macos notify skipped or failed\n`
);
process.exit(0);
