/**
 * Open-Xchange client. Live HTTP only after a public CE image probe succeeds.
 * Path: src/lib/integrations/sovereign/ox-client.ts
 */
import type { ConnectorInclusion } from "../../../../schemas/connectors.js";
import type {
  CalendarPort,
  MailFetchResult,
  MailFetchedMessage,
  MailPort,
  MailSendResult,
  PortResult,
} from "../ports.js";
import { STUB_DOES_NOT_LEAVE } from "../ports.js";

export interface OxConfig {
  baseUrl: string;
  user?: string;
  password?: string;
}

export function oxConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OxConfig | null {
  const baseUrl = env.ORGOS_OX_BASE_URL?.trim();
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    user: env.ORGOS_OX_USER?.trim() || undefined,
    password: env.ORGOS_OX_PASSWORD?.trim() || undefined,
  };
}

export function oxStubResult(): PortResult {
  return {
    ok: false,
    reason: `Open-Xchange は公開 CE イメージが未確定です。${STUB_DOES_NOT_LEAVE}`,
  };
}

/** One authenticated call. Stub inclusion never touches the network. */
export async function pingOx(input: {
  inclusion: ConnectorInclusion;
  config?: OxConfig | null;
  fetchImpl?: typeof fetch;
}): Promise<PortResult> {
  if (input.inclusion !== "confirmed_live") return oxStubResult();
  if (!input.config) return { ok: false, reason: "Open-Xchange の base URL が未設定です" };
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = {};
  if (input.config.user && input.config.password) {
    const token = Buffer.from(`${input.config.user}:${input.config.password}`).toString("base64");
    headers.Authorization = `Basic ${token}`;
  }
  const res = await fetchImpl(`${input.config.baseUrl}/appsuite/api/health`, { headers });
  if (!res.ok) return { ok: false, reason: `ox_http_${res.status}` };
  return { ok: true, reason: "ok" };
}

const INBOX = "default0/INBOX";
const FETCH_CAP = 15;

interface OxSession {
  ok: true;
  session: string;
}

async function oxLogin(
  config: OxConfig,
  fetchImpl: typeof fetch,
): Promise<OxSession | PortResult> {
  if (!config.user || !config.password) {
    return { ok: false, reason: "Open-Xchange の user / password が未設定です" };
  }
  const body = new URLSearchParams({
    name: config.user,
    password: config.password,
    client: "open-xchange-appsuite",
  });
  const res = await fetchImpl(`${config.baseUrl}/appsuite/api/login?action=login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return { ok: false, reason: `ox_http_${res.status}` };
  const json = (await res.json()) as { session?: string };
  if (!json.session) return { ok: false, reason: "ox login has no session" };
  return { ok: true, session: json.session };
}

function isSession(value: OxSession | PortResult): value is OxSession {
  return value.ok === true && "session" in value;
}

function addressOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return addressOf(value[0]);
  if (value && typeof value === "object" && "address" in value) {
    const address = (value as { address?: unknown }).address;
    return typeof address === "string" ? address : "";
  }
  return "";
}

function textOf(row: Record<string, unknown>): string {
  if (typeof row.body === "string") return row.body;
  if (!Array.isArray(row.attachments)) return "";
  for (const part of row.attachments) {
    if (!part || typeof part !== "object") continue;
    const item = part as Record<string, unknown>;
    const type = typeof item.content_type === "string" ? item.content_type : "";
    if (type.startsWith("text/plain") && typeof item.content === "string") return item.content;
  }
  return "";
}

/** Rebuilds a text MIME when OX does not return the original source. */
function messageFromOxGet(data: unknown): MailFetchedMessage | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const id = row.id == null ? "" : String(row.id);
  if (!id) return null;
  if (typeof row.source === "string" && row.source.trim()) {
    return { id, mime: row.source };
  }
  const subject = typeof row.subject === "string" ? row.subject : "";
  const body = textOf(row);
  if (!subject && !body) return null;
  return {
    id,
    mime: [
      `From: ${addressOf(row.from)}`,
      `To: ${addressOf(row.to)}`,
      `Subject: ${subject}`,
      "X-OrgOS-OX: reconstructed",
      "",
      body,
    ].join("\r\n"),
  };
}

function parseSimpleMime(mime: string): { to: string[]; subject: string; body: string } | null {
  const [header, ...rest] = mime.split(/\r?\n\r?\n/);
  if (!header) return null;
  const toLine = header.match(/^To:\s*(.+)$/im)?.[1];
  if (!toLine) return null;
  const to = toLine
    .split(",")
    .map((part) => part.replace(/.*<([^>]+)>.*/, "$1").trim())
    .filter(Boolean);
  if (!to.length) return null;
  const subject = header.match(/^Subject:\s*(.+)$/im)?.[1]?.trim() ?? "";
  return { to, subject, body: rest.join("\n\n") };
}

async function oxFetchSince(
  config: OxConfig,
  fetchImpl: typeof fetch,
): Promise<MailFetchResult> {
  const login = await oxLogin(config, fetchImpl);
  if (!isSession(login)) return { ...login, messages: [], fetched: 0 };
  const listUrl =
    `${config.baseUrl}/appsuite/api/mail?action=all` +
    `&session=${encodeURIComponent(login.session)}` +
    `&folder=${encodeURIComponent(INBOX)}` +
    "&columns=600,607,610";
  const listed = await fetchImpl(listUrl);
  if (!listed.ok) {
    return { ok: false, reason: `ox_http_${listed.status}`, messages: [], fetched: 0 };
  }
  const listJson = (await listed.json()) as { data?: unknown[] };
  const rows = Array.isArray(listJson.data) ? listJson.data.slice(0, FETCH_CAP) : [];
  const messages: MailFetchedMessage[] = [];
  for (const row of rows) {
    const id = Array.isArray(row) ? row[0] : (row as { id?: unknown } | null)?.id;
    if (id == null) continue;
    const got = await fetchImpl(
      `${config.baseUrl}/appsuite/api/mail?action=get` +
        `&session=${encodeURIComponent(login.session)}` +
        `&id=${encodeURIComponent(String(id))}` +
        `&folder=${encodeURIComponent(INBOX)}`,
    );
    if (!got.ok) {
      return { ok: false, reason: `ox_http_${got.status}`, messages: [], fetched: 0 };
    }
    const body = (await got.json()) as { data?: unknown };
    const message = messageFromOxGet(body.data);
    if (message) messages.push(message);
  }
  return { ok: true, reason: "ok", messages, fetched: messages.length };
}

async function oxSendMime(
  config: OxConfig,
  mime: string,
  fetchImpl: typeof fetch,
): Promise<MailSendResult> {
  const parsed = parseSimpleMime(mime);
  if (!parsed) return { ok: false, reason: "Open-Xchange send には To ヘッダが必要です" };
  const login = await oxLogin(config, fetchImpl);
  if (!isSession(login)) return login;
  const res = await fetchImpl(
    `${config.baseUrl}/appsuite/api/mail?action=send&session=${encodeURIComponent(login.session)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.user,
        to: parsed.to.map((address) => ({ address })),
        subject: parsed.subject,
        content: parsed.body,
        contentType: "text/plain",
      }),
    },
  );
  if (!res.ok) return { ok: false, reason: `ox_http_${res.status}` };
  const json = (await res.json()) as { data?: { id?: string | number } };
  const messageId = json.data?.id == null ? undefined : String(json.data.id);
  return { ok: true, reason: "ok", messageId };
}

export function oxMailPort(
  inclusion: ConnectorInclusion,
  config: OxConfig | null,
  fetchImpl: typeof fetch = fetch,
): MailPort {
  return {
    provider: "ox",
    async ping() {
      return pingOx({ inclusion, config, fetchImpl });
    },
    async fetchSince(): Promise<MailFetchResult> {
      if (inclusion !== "confirmed_live") {
        return { ...oxStubResult(), messages: [], fetched: 0 };
      }
      if (!config) {
        return { ok: false, reason: "Open-Xchange の base URL が未設定です", messages: [], fetched: 0 };
      }
      return oxFetchSince(config, fetchImpl);
    },
    async sendMime(input): Promise<MailSendResult> {
      if (inclusion !== "confirmed_live") return oxStubResult();
      if (input.dryRun) return { ok: true, dryRun: true, reason: "ok" };
      if (!config) return { ok: false, reason: "Open-Xchange の base URL が未設定です" };
      return oxSendMime(config, input.mime, fetchImpl);
    },
  };
}

/** Calendar availability uses the same inclusion gate. Stub never calls fetch. */
export function oxCalendarPort(
  inclusion: ConnectorInclusion,
  config: OxConfig | null,
  fetchImpl: typeof fetch = fetch,
): CalendarPort {
  return {
    provider: "ox",
    async ping(input) {
      if (input?.dryRun) return { ok: true, dryRun: true, reason: "ok" };
      if (inclusion !== "confirmed_live") return oxStubResult();
      if (!config) return { ok: false, reason: "Open-Xchange の base URL が未設定です" };
      const login = await oxLogin(config, fetchImpl);
      if (!isSession(login)) return login;
      const res = await fetchImpl(
        `${config.baseUrl}/appsuite/api/calendar?action=all` +
          `&session=${encodeURIComponent(login.session)}` +
          "&columns=1",
      );
      if (!res.ok) return { ok: false, reason: `ox_http_${res.status}` };
      return { ok: true, reason: "ok" };
    },
  };
}
