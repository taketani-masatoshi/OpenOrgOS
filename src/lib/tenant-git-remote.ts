/**
 * Tenant history remotes belong on the NAS (file:// or ssh).
 * Public forges are refused. This does not inspect the product repository.
 */

const FORBIDDEN_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "gist.github.com",
  "gitlab.com",
  "www.gitlab.com",
  "bitbucket.org",
  "www.bitbucket.org",
]);

export type TenantGitRemoteClass = "nas" | "forbidden" | "unknown";

export type TenantGitRemoteVerdict = {
  classification: TenantGitRemoteClass;
  host: string | null;
  message: string;
};

function hostFromUrl(url: string): string | null {
  const scp = /^[\w.+-]+@([^:/]+):/.exec(url);
  if (scp && !url.includes("://")) return scp[1].toLowerCase();
  try {
    const parsed = new URL(url);
    return parsed.hostname ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

function schemeOf(url: string): string | null {
  const idx = url.indexOf("://");
  if (idx <= 0) return null;
  return url.slice(0, idx).toLowerCase();
}

export function classifyTenantGitRemote(url: string): TenantGitRemoteVerdict {
  const trimmed = url.trim();
  if (!trimmed) {
    return {
      classification: "unknown",
      host: null,
      message: "git remote が空です",
    };
  }
  const host = hostFromUrl(trimmed);
  if (host && FORBIDDEN_HOSTS.has(host)) {
    return {
      classification: "forbidden",
      host,
      message: `テナント履歴のリモートに ${host} は使えません。NAS の file:// または社内 ssh を使ってください`,
    };
  }
  const scheme = schemeOf(trimmed);
  if (scheme === "file" || scheme === "ssh" || (host && !scheme && trimmed.includes("@"))) {
    return {
      classification: "nas",
      host,
      message: host
        ? `テナント履歴のリモートは ${host}（公開ホストではない）`
        : "テナント履歴のリモートは file://（NAS 上の Git）",
    };
  }
  return {
    classification: "unknown",
    host,
    message:
      "テナント履歴のリモートは file:// または ssh だけを受け付けます。https の公開・私設ホストは使いません",
  };
}
