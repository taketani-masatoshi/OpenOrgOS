import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** AppleScript / shell 安全化 — 制御文字除去 · 長さ制限 */
export function escapeAppleScriptString(value: string, maxLen = 180): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** 表示用に中黒・全角括弧を避け、通知バナーが崩れない文字列にする */
export function sanitizeNotificationText(value: string, maxLen = 180): string {
  return value
    .replace(/[·•]/g, " - ")
    .replace(/[（）]/g, (ch) => (ch === "（" ? "(" : ")"))
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export type MacOSNotifyKind = "today" | "mail_high" | "generic";

export interface MacOSNotificationInput {
  title: string;
  subtitle?: string;
  body: string;
  /** 任意 · Glass / Blow / default */
  sound?: string;
  kind?: MacOSNotifyKind;
}

/** HHMM / HH:MM → スロット表示（09:00 / 午後 など） */
export function formatTodayDigestSlotLabel(slot: string): string {
  const digits = slot.replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  const hh = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const clock = `${hh}:${mm}`;
  if (digits === "0900") return `朝 ${clock}`;
  if (digits === "1300") return `午後 ${clock}`;
  if (digits === "1700") return `夕方 ${clock}`;
  return clock;
}

export function buildTodayDigestNotification(opts: {
  summary: string;
  slot: string;
  /** 省略時は通知生成時刻（JST） */
  updatedAt?: string;
}): MacOSNotificationInput {
  const slotLabel = formatTodayDigestSlotLabel(opts.slot);
  const updatedAt =
    opts.updatedAt?.trim() ||
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  return {
    kind: "today",
    title: "MAL Today",
    subtitle: `${slotLabel} - 更新 ${sanitizeNotificationText(updatedAt, 40)}`,
    body: sanitizeNotificationText(opts.summary, 120),
    sound: "Glass",
  };
}

function terminalNotifierPath(): string | undefined {
  const candidates = [
    process.env.ORGOS_TERMINAL_NOTIFIER?.trim(),
    "/opt/homebrew/bin/terminal-notifier",
    "/usr/local/bin/terminal-notifier",
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p));
}

/**
 * macOS 通知。
 * - `terminal-notifier` があれば優先（アプリ名・アイコンが安定）
 * - なければ osascript（Script Editor アイコンになりやすい）
 * CI: ORGOS_SKIP_MACOS_NOTIFY=1
 */
export async function displayMacOSNotification(
  input: MacOSNotificationInput
): Promise<boolean> {
  if (process.env.ORGOS_SKIP_MACOS_NOTIFY === "1") return false;
  if (process.platform !== "darwin") return false;

  const title = sanitizeNotificationText(input.title, 48);
  const body = sanitizeNotificationText(input.body, 160);
  const subtitle = input.subtitle
    ? sanitizeNotificationText(input.subtitle, 80)
    : undefined;
  const sound = input.sound ?? "Glass";

  const tn = terminalNotifierPath();
  if (tn) {
    const args = [
      "-title",
      title,
      "-message",
      body,
      "-sound",
      sound,
      "-sender",
      "com.apple.Terminal",
      "-activate",
      "com.apple.Terminal",
    ];
    if (subtitle) {
      args.push("-subtitle", subtitle);
    }
    if (input.kind === "mail_high") {
      args.push("-group", "orgos-mail-high");
    } else if (input.kind === "today") {
      args.push("-group", "orgos-today-digest");
    }
    try {
      await execFileAsync(tn, args, { timeout: 8000 });
      return true;
    } catch {
      // fall through to osascript
    }
  }

  const script = subtitle
    ? `display notification "${escapeAppleScriptString(body)}" with title "${escapeAppleScriptString(title, 48)}" subtitle "${escapeAppleScriptString(subtitle, 80)}" sound name "${escapeAppleScriptString(sound, 32)}"`
    : `display notification "${escapeAppleScriptString(body)}" with title "${escapeAppleScriptString(title, 48)}" sound name "${escapeAppleScriptString(sound, 32)}"`;

  try {
    await execFileAsync("/usr/bin/osascript", ["-e", script], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
