/**
 * Nextcloud WebDAV put + status ping. L2 paths are rejected.
 * Path: src/lib/integrations/sovereign/nextcloud-webdav.ts
 */
import type { FilesPort, PortResult } from "../ports.js";

const ALLOWED_PREFIXES = ["opendesk-verify/", "docs/"] as const;

export interface NextcloudConfig {
  baseUrl: string;
  user: string;
  password: string;
}

export function nextcloudConfigFromEnv(env: NodeJS.ProcessEnv = process.env): NextcloudConfig | null {
  const baseUrl = env.ORGOS_NEXTCLOUD_BASE_URL?.trim();
  const user = env.ORGOS_NEXTCLOUD_USER?.trim();
  const password = env.ORGOS_NEXTCLOUD_APP_PASSWORD?.trim();
  if (!baseUrl || !user || !password) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), user, password };
}

/** Allowlist for copies. Tenant data/ YAML never leaves. */
export function assertOpenDeskFilePath(path: string): void {
  const normalized = path.replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\\")) {
    throw new Error("path rejected");
  }
  if (normalized === "data" || normalized.startsWith("data/")) {
    throw new Error("data/ is not exportable");
  }
  const allowed = ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  if (!allowed) throw new Error("path not on the openDesk allowlist");
}

function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

export async function pingNextcloud(
  config: NextcloudConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<PortResult> {
  const res = await fetchImpl(`${config.baseUrl}/status.php`);
  if (!res.ok) return { ok: false, reason: `nextcloud_http_${res.status}` };
  return { ok: true, reason: "ok" };
}

export async function putNextcloudFile(
  config: NextcloudConfig,
  path: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PortResult> {
  assertOpenDeskFilePath(path);
  const encoded = path
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = `${config.baseUrl}/remote.php/dav/files/${encodeURIComponent(config.user)}/${encoded}`;
  const res = await fetchImpl(url, {
    method: "PUT",
    headers: {
      Authorization: basicAuth(config.user, config.password),
      "Content-Type": "text/plain; charset=utf-8",
    },
    body,
  });
  if (!res.ok) return { ok: false, reason: `nextcloud_http_${res.status}` };
  return { ok: true, reason: "ok" };
}

export function nextcloudFilesPort(
  config: NextcloudConfig,
  fetchImpl: typeof fetch = fetch,
): FilesPort {
  return {
    provider: "nextcloud",
    async put(input) {
      if (input.dryRun) {
        assertOpenDeskFilePath(input.path);
        return { ok: true, dryRun: true, reason: "dry_run — Nextcloud へは出していません" };
      }
      return putNextcloudFile(config, input.path, input.body, fetchImpl);
    },
  };
}
