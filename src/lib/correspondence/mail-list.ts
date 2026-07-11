import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listCorrespondenceDrafts } from "./draft.js";
import { getMailReceivedDir, getMailSentDir } from "./paths.js";
import { loadMailConfig } from "./mail-config.js";

export interface MailListEntry {
  id: string;
  direction: "sent" | "received";
  subject: string;
  to?: string;
  from?: string;
  date: string;
  source: "draft" | "eml" | "stub";
}

export function listExecutiveMail(opts?: {
  direction?: "sent" | "received" | "all";
  limit?: number;
}): MailListEntry[] {
  const direction = opts?.direction ?? "all";
  const limit = opts?.limit ?? 50;
  const entries: MailListEntry[] = [];

  if (direction === "sent" || direction === "all") {
    for (const draft of listCorrespondenceDrafts({ channel: "email", status: "sent" })) {
      entries.push({
        id: draft.draft_id,
        direction: "sent",
        subject: draft.subject ?? "(no subject)",
        to: draft.to,
        date: draft.sent_at ?? draft.created_at,
        source: "draft",
      });
    }
    const sentDir = getMailSentDir();
    if (existsSync(sentDir)) {
      for (const name of readdirSync(sentDir)) {
        if (!name.endsWith(".eml")) continue;
        const raw = readFileSync(join(sentDir, name), "utf-8");
        const subject = raw.match(/^Subject: (.+)$/m)?.[1] ?? name;
        const to = raw.match(/^To: (.+)$/m)?.[1];
        entries.push({
          id: name.replace(/\.eml$/, ""),
          direction: "sent",
          subject,
          to,
          date: name.match(/DRAFT-\d{8}/)?.[0] ?? "unknown",
          source: "eml",
        });
      }
    }
  }

  if (direction === "received" || direction === "all") {
    const receivedDir = getMailReceivedDir();
    if (existsSync(receivedDir)) {
      for (const name of readdirSync(receivedDir)) {
        if (!name.endsWith(".eml") && !name.endsWith(".md")) continue;
        entries.push({
          id: name,
          direction: "received",
          subject: name,
          date: "local",
          source: "eml",
        });
      }
    }
  }

  const config = loadMailConfig();
  if (entries.length === 0 && (direction === "received" || direction === "all")) {
    entries.push({
      id: "correspondence-receive-stub",
      direction: "received",
      subject: `(correspondence receive sync: ${config?.receive?.sync ?? "stub"} — not docs/io/inbox nor Wire protocol/inbox)`,
      date: new Date().toISOString(),
      source: "stub",
    });
  }

  return entries.slice(0, limit);
}
