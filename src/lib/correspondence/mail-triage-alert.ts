import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type { MacOSNotificationInput } from "../notifications/macos-notify.js";

export interface MailTriagePushItem {
  id: string;
  subject: string;
  from: string;
  importance: MailTriageEntry["importance"];
  urgency: MailTriageEntry["urgency"];
}

export function formatMailTriagePriorityLabel(
  entry: Pick<MailTriageEntry, "importance" | "urgency">
): string {
  const parts: string[] = [];
  if (entry.importance === "p0" || entry.importance === "p1") {
    parts.push(entry.importance.toUpperCase());
  }
  if (entry.urgency === "immediate" || entry.urgency === "today") {
    parts.push(entry.urgency === "immediate" ? "至急" : "本日中");
  }
  return parts.length ? parts.join(" · ") : "高優先";
}

export function formatMailTriagePushItem(entry: MailTriageEntry): MailTriagePushItem {
  return {
    id: entry.id,
    subject: entry.subject,
    from: entry.from,
    importance: entry.importance,
    urgency: entry.urgency,
  };
}

export function formatMailTriageDesktopAlert(entry: MailTriageEntry): MacOSNotificationInput {
  const priority = formatMailTriagePriorityLabel(entry);
  return {
    kind: "mail_high",
    title: "MAL Mail",
    subtitle: priority,
    body: `${entry.subject} — ${entry.from}`,
    sound: "Blow",
  };
}

export function filterHighPriorityMailIntake<
  T extends Pick<MailTriageEntry, "importance" | "urgency">,
>(items: T[]): T[] {
  return items.filter(
    (item) =>
      item.importance === "p0" ||
      item.importance === "p1" ||
      item.urgency === "immediate" ||
      item.urgency === "today"
  );
}
