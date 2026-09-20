/**
 * Tenant history remotes belong on the NAS (file://, ssh, or a private https host).
 * Public forges, including their SSH hostnames, are refused in any scheme.
 * This does not inspect the product repository's own origin.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const FORBIDDEN_SUFFIXES = ["github.com", "gitlab.com", "bitbucket.org"] as const;

export type TenantGitRemoteClass = "nas" | "forbidden" | "unknown" | "unverified";

export type TenantGitRemoteVerdict = {
  classification: TenantGitRemoteClass;
  host: string | null;
  message: string;
};

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.+$/g, "");
}

function isPublicForgeHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return FORBIDDEN_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
}

function hostFromUrl(url: string): string | null {
  const scp = /^[\w.+-]+@([^:/]+):/.exec(url);
  if (scp && !url.includes("://")) return normalizeHost(scp[1]);
  try {
    const parsed = new URL(url);
    return parsed.hostname ? normalizeHost(parsed.hostname) : null;
  } catch {
    return null;
  }
}

function schemeOf(url: string): string | null {
  const idx = url.indexOf("://");
  if (idx <= 0) return null;
  return url.slice(0, idx).toLowerCase();
}

function forbidden(host: string): TenantGitRemoteVerdict {
  return {
    classification: "forbidden",
    host,
    message: `テナント履歴のリモートに ${host} は使えません。NAS の file://、社内 ssh、または公開フォージ以外の https を使ってください`,
  };
}

function filePathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") return null;
    return decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
}

function isGitDir(repoPath: string): boolean {
  if (existsSync(join(repoPath, ".git"))) return true;
  return existsSync(join(repoPath, "HEAD")) && existsSync(join(repoPath, "config"));
}

function gitRemoteUrls(repoPath: string): string[] {
  const listed = spawnSync("git", ["-C", repoPath, "remote"], { encoding: "utf8" });
  if (listed.status !== 0) return [];
  const names = listed.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const urls: string[] = [];
  for (const name of names) {
    const got = spawnSync("git", ["-C", repoPath, "remote", "get-url", name], {
      encoding: "utf8",
    });
    if (got.status === 0 && got.stdout.trim()) urls.push(got.stdout.trim());
  }
  return urls;
}

function classifyFileRemote(url: string, depth: number): TenantGitRemoteVerdict {
  const repoPath = filePathFromUrl(url);
  if (!repoPath || !existsSync(repoPath)) {
    return {
      classification: "unverified",
      host: null,
      message: "file:// のパスを読めないため未検査です。マウントを確認してください",
    };
  }
  if (!isGitDir(repoPath) || depth >= 2) {
    return {
      classification: "nas",
      host: null,
      message: "テナント履歴のリモートは file://（NAS 上の Git）",
    };
  }
  const remotes = gitRemoteUrls(repoPath);
  for (const remote of remotes) {
    const inner = classifyTenantGitRemote(remote, depth + 1);
    if (inner.classification === "forbidden") return inner;
    if (inner.classification === "unverified") return inner;
  }
  return {
    classification: "nas",
    host: null,
    message: "テナント履歴のリモートは file://（NAS 上の Git）",
  };
}

/** Remotes of a git worktree at the tenant root. Null when that directory is not a repo. */
export function classifyRepoRemotes(repoPath: string): TenantGitRemoteVerdict | null {
  if (!existsSync(join(repoPath, ".git"))) return null;
  for (const remote of gitRemoteUrls(repoPath)) {
    const verdict = classifyTenantGitRemote(remote);
    if (verdict.classification === "forbidden") return verdict;
  }
  return null;
}

export function classifyTenantGitRemote(url: string, depth = 0): TenantGitRemoteVerdict {
  const trimmed = url.trim();
  if (!trimmed) {
    return {
      classification: "unknown",
      host: null,
      message: "git remote が空です",
    };
  }
  const host = hostFromUrl(trimmed);
  if (host && isPublicForgeHost(host)) return forbidden(host);
  const scheme = schemeOf(trimmed);
  if (scheme === "file") return classifyFileRemote(trimmed, depth);
  if (
    scheme === "ssh" ||
    scheme === "https" ||
    scheme === "http" ||
    (host && !scheme && trimmed.includes("@"))
  ) {
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
    message: "テナント履歴のリモートを分類できません",
  };
}

/** file:// URL for a local path. Used by tests and callers that already have a path. */
export function fileUrlForLocalPath(absPath: string): string {
  return pathToFileURL(absPath).href;
}
