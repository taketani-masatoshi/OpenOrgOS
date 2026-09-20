/**
 * Gmail API helpers shared by the compat MailPort and correspondence sync/send.
 * Path: src/lib/integrations/compat/gmail-api.ts
 */
import { resolveGmailAccessToken } from "../../correspondence/gmail-oauth.js";

export interface GmailFetchMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  raw: string;
}

export interface GmailApiClient {
  listMessageIds(opts: { labelIds?: string[]; afterInternalDate?: number }): Promise<string[]>;
  getMessageRaw(id: string): Promise<GmailFetchMessage | null>;
  getThreadMessageIds?(threadId: string): Promise<string[]>;
}

export function createGmailApiClient(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): GmailApiClient {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";

  return {
    async listMessageIds(opts) {
      const params = new URLSearchParams({ maxResults: "50" });
      for (const label of opts.labelIds ?? ["INBOX"]) {
        params.append("labelIds", label);
      }
      if (opts.afterInternalDate != null) {
        params.set("q", `after:${Math.floor(opts.afterInternalDate / 1000)}`);
      }
      const res = await fetchImpl(`${base}/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { messages?: Array<{ id: string }> };
      return (body.messages ?? []).map((m) => m.id);
    },

    async getMessageRaw(id) {
      const res = await fetchImpl(`${base}/messages/${id}?format=raw`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        id: string;
        threadId?: string;
        internalDate?: string;
        raw?: string;
      };
      if (!body.raw) return null;
      const raw = Buffer.from(body.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf-8",
      );
      return {
        id: body.id,
        threadId: body.threadId,
        internalDate: body.internalDate,
        raw,
      };
    },

    async getThreadMessageIds(threadId) {
      const res = await fetchImpl(`${base}/threads/${threadId}?format=minimal`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { messages?: Array<{ id: string }> };
      return (body.messages ?? []).map((m) => m.id);
    },
  };
}

export async function sendGmailRawMime(
  mime: string,
  fetchImpl: typeof fetch = fetch,
  resolveToken: () => Promise<string | null> = resolveGmailAccessToken,
): Promise<{ ok: true; messageId: string } | { ok: false; reason: string }> {
  const accessToken = await resolveToken();
  if (!accessToken) {
    return { ok: false, reason: "Gmail API token missing — run orgos mail setup gmail" };
  }
  const raw = Buffer.from(mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const res = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, reason: `Gmail API send failed: ${res.status} ${err.slice(0, 200)}` };
  }
  const body = (await res.json()) as { id?: string };
  return { ok: true, messageId: body.id ?? `${Date.now()}@gmail-api` };
}
