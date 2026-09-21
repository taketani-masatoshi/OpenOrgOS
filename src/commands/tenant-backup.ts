import { getTenantDir, getTenantId } from "../lib/tenant.js";
import { isOperatorAuthBypassed } from "../lib/console-auth/operator-rbac.js";
import { requireCliOperator } from "../lib/console-auth/cli-operator.js";
import {
  checkTenantBackupForWeekly,
  restoreTenantBackup,
  snapshotTenantBackup,
  tenantBackupStampAgeDays,
  loadBackupTarget,
} from "../lib/tenant-backup.js";
import { classifyRepoRemotes, classifyTenantGitRemote } from "../lib/tenant-git-remote.js";

function emit(json: boolean, payload: unknown, lines: string[]): void {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  for (const line of lines) console.log(line);
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function requireTenantBackupOperator(command: string): void {
  if (isOperatorAuthBypassed()) return;
  const auth = requireCliOperator({ permission: "chat:approve", command });
  if (auth.record.role !== "ceo" && auth.record.role !== "approver") {
    throw new Error(
      `${command} requires ceo or approver role (got ${auth.record.role}).`,
    );
  }
}

export function runTenantBackupStatus(opts: { json?: boolean } = {}): void {
  const tenantDir = getTenantDir();
  const check = checkTenantBackupForWeekly(tenantDir);
  const loaded = loadBackupTarget(tenantDir);
  const payload = {
    ok: check.ok,
    kind: check.kind,
    configured: loaded.state !== "missing",
    age_days: tenantBackupStampAgeDays(tenantDir),
    destination: loaded.state === "ready" ? loaded.target.destination : null,
    message: check.message,
  };
  emit(Boolean(opts.json), payload, [
    check.ok ? `✓ ${check.message}` : `⚠ ${check.message}`,
  ]);
}

export function runTenantBackupSnapshot(opts: { json?: boolean } = {}): void {
  try {
    requireTenantBackupOperator("orgos tenant backup snapshot");
    const result = snapshotTenantBackup({
      tenantDir: getTenantDir(),
      tenantId: getTenantId(),
    });
    emit(Boolean(opts.json), { ok: true, ...result }, [
      `✓ 退避しました ${result.archivePath}`,
      `  stamp: ${result.stampedAt}`,
    ]);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

export function runTenantBackupRestore(opts: {
  archive: string;
  into: string;
  json?: boolean;
}): void {
  try {
    requireTenantBackupOperator("orgos tenant backup restore");
    const result = restoreTenantBackup({
      archivePath: opts.archive,
      intoDir: opts.into,
      liveTenantDir: getTenantDir(),
    });
    emit(Boolean(opts.json), { ok: true, ...result }, [
      `✓ 空のディレクトリへ復元しました ${result.extractedTo}`,
      "  正本は置き換えていません。中身を確認してから人が移してください。",
    ]);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

export function runTenantGitRemoteCheck(opts: { url?: string; json?: boolean } = {}): void {
  const explicit = opts.url?.trim();
  if (explicit) {
    emitGitRemoteVerdict(explicit, opts.json);
    return;
  }

  const tenantDir = getTenantDir();
  const loaded = loadBackupTarget(tenantDir);
  if (loaded.state === "invalid") fail(loaded.message);

  const yamlRemote =
    loaded.state === "ready" && loaded.target.git_remote ? loaded.target.git_remote : null;
  const localGit = classifyRepoRemotes(tenantDir);

  if (!yamlRemote && localGit.state === "absent") {
    emit(Boolean(opts.json), { ok: true, configured: false, message: "git_remote は未設定です" }, [
      "✓ git_remote は未設定です。設定するときは NAS の file://、社内 ssh、または公開フォージ以外の https にしてください。",
    ]);
    return;
  }

  if (localGit.state === "forbidden") {
    emitGitRemoteFail(localGit.verdict, opts.json, yamlRemote);
  }

  if (yamlRemote) {
    emitGitRemoteVerdict(yamlRemote, opts.json);
    return;
  }

  emit(
    Boolean(opts.json),
    {
      ok: true,
      configured: true,
      source: "tenant_git",
      classification: "nas",
      message: "テナント直下の .git remote は公開フォージではありません",
    },
    ["✓ テナント直下の .git remote は公開フォージではありません"],
  );
}

function emitGitRemoteFail(
  verdict: { classification: string; host: string | null; message: string },
  json: boolean | undefined,
  url: string | null,
): never {
  const payload = { ok: false, url, ...verdict };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
  fail(verdict.message);
}

function emitGitRemoteVerdict(url: string, json: boolean | undefined): void {
  const verdict = classifyTenantGitRemote(url);
  const ok = verdict.classification === "nas";
  const payload = { ok, url, ...verdict };
  if (verdict.classification === "unverified") {
    emit(Boolean(json), payload, [`⚠ ${verdict.message}`]);
    return;
  }
  if (!ok) {
    emitGitRemoteFail(verdict, json, url);
  }
  emit(Boolean(json), payload, [`✓ ${verdict.message}`]);
}
