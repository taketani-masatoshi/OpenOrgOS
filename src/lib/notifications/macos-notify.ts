import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const NOTIFY_DEFAULT_MAX_LEN = 180;
const NOTIFY_UPDATED_AT_MAX_LEN = 40;
const NOTIFY_SUMMARY_MAX_LEN = 120;
const NOTIFY_TITLE_MAX_LEN = 48;
const NOTIFY_BODY_MAX_LEN = 160;
const NOTIFY_SUBTITLE_MAX_LEN = 80;
const NOTIFY_SOUND_MAX_LEN = 32;
const TERMINAL_NOTIFIER_TIMEOUT_MS = 8000;
const OSASCRIPT_TIMEOUT_MS = 5000;

/** AppleScript / shell 安全化 — 制御文字除去 · 長さ制限 */
export function escapeAppleScriptString(value: string, maxLen = NOTIFY_DEFAULT_MAX_LEN): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** 表示用に中黒・全角括弧を避け、通知バナーが崩れない文字列にする */
export function sanitizeNotificationText(value: string, maxLen = NOTIFY_DEFAULT_MAX_LEN): string {
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
    subtitle: `${slotLabel} - 更新 ${sanitizeNotificationText(updatedAt, NOTIFY_UPDATED_AT_MAX_LEN)}`,
    body: sanitizeNotificationText(opts.summary, NOTIFY_SUMMARY_MAX_LEN),
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
export async function displayMacOSNotification(input: MacOSNotificationInput): Promise<boolean> {
  if (process.env.ORGOS_SKIP_MACOS_NOTIFY === "1") return false;
  if (process.platform !== "darwin") return false;

  const title = sanitizeNotificationText(input.title, NOTIFY_TITLE_MAX_LEN);
  const body = sanitizeNotificationText(input.body, NOTIFY_BODY_MAX_LEN);
  const subtitle = input.subtitle
    ? sanitizeNotificationText(input.subtitle, NOTIFY_SUBTITLE_MAX_LEN)
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
      await execFileAsync(tn, args, { timeout: TERMINAL_NOTIFIER_TIMEOUT_MS });
      return true;
    } catch {
      // fall through to osascript
    }
  }

  const script = subtitle
    ? `display notification "${escapeAppleScriptString(body)}" with title "${escapeAppleScriptString(title, NOTIFY_TITLE_MAX_LEN)}" subtitle "${escapeAppleScriptString(subtitle, NOTIFY_SUBTITLE_MAX_LEN)}" sound name "${escapeAppleScriptString(sound, NOTIFY_SOUND_MAX_LEN)}"`
    : `display notification "${escapeAppleScriptString(body)}" with title "${escapeAppleScriptString(title, NOTIFY_TITLE_MAX_LEN)}" sound name "${escapeAppleScriptString(sound, NOTIFY_SOUND_MAX_LEN)}"`;

  try {
    await execFileAsync("/usr/bin/osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}
