import { resolveSlackWebhookUrl } from "./mail-config.js";
import { findTriageEntry } from "./mail-triage-queue.js";

export async function sendInboundSlackDigest(entryIds: string[]): Promise<boolean> {
  const webhook = resolveSlackWebhookUrl();
  if (!webhook || !entryIds.length) return false;

  const lines = ["*Mail Intake — high priority*", ""];
  for (const id of entryIds) {
    const entry = findTriageEntry(id);
    if (!entry || entry.disposition === "spam") continue;
    lines.push(
      `• [${entry.importance}/${entry.urgency}] ${entry.subject} — ${entry.from} (\`${entry.id}\`)`
    );
  }
  if (lines.length <= 2) return false;

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: lines.join("\n") }),
  });
  return res.ok;
}
