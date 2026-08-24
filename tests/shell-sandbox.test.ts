import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { tenantDispatchRoot, assertDispatchCwdWithinTenant } from "../src/lib/org-boundary.js";
import { buildShellCommand } from "../src/lib/operator-runtime/config.js";
import { assertResolvedShellCommandSafe, assertShellCwdIsRunWorkspace, assertShellCommandAllowlist, assertShellCommandAvoidsCanonicalWrites } from "../src/lib/operator-runtime/shell.js";
import type { ResolvedShellCommand } from "../src/lib/operator-runtime/config.js";
import { setCliOperatorContext } from "../src/lib/console-auth/cli-operator.js";
import { isProdSecurityMode } from "../src/lib/console-auth/operator-rbac.js";

describe("shell sandbox", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    setCliOperatorContext(undefined);
    delete process.env.ORGOS_ENV;
    delete process.env.ORGOS_SHELL_AUTO_YES;
  });

  afterEach(() => {
    process.env = { ...env };
    setCliOperatorContext(undefined);
  });

  it("uses the provided workspace placeholder for shell cwd", () => {
    const root = tenantDispatchRoot();
    const resolved = buildShellCommand({
      promptPath: "/tmp/prompt.md",
      workspace: root,
      tenant: "demo",
      tenantRoot: root,
    });
    expect(resolved?.cwd).toBe(root);
  });

  it("rejects aia-runs-missing cwd when FS-guard is enforced", () => {
    process.env.ORGOS_FS_GUARD = "enforce";
    expect(() => assertShellCwdIsRunWorkspace(tenantDispatchRoot())).toThrow(/data\/scratch\/aia-runs/);
  });

  it("rejects docs/scratch/aia-runs cwd when FS-guard is enforced", () => {
    process.env.ORGOS_FS_GUARD = "enforce";
    expect(() =>
      assertShellCwdIsRunWorkspace(`${tenantDispatchRoot()}/docs/scratch/aia-runs/RUN-1`)
    ).toThrow(/data\/scratch\/aia-runs/);
  });

  it("allows scratch/aia-runs cwd when FS-guard is enforced", () => {
    process.env.ORGOS_FS_GUARD = "enforce";
    expect(() =>
      assertShellCwdIsRunWorkspace(`${tenantDispatchRoot()}/data/scratch/aia-runs/RUN-1`)
    ).not.toThrow();
  });

  it("blocks shell redirects onto canonical data paths", () => {
    process.env.ORGOS_FS_GUARD = "enforce";
    expect(() =>
      assertShellCommandAvoidsCanonicalWrites(["bash", "-lc", "echo x > data/finance/cash.yaml"])
    ).toThrow(/canonical/);
    expect(() =>
      assertShellCommandAvoidsCanonicalWrites([
        "orgos",
        "guard",
        "apply",
        "--path",
        "data/finance/cash.yaml",
      ])
    ).not.toThrow();
  });

  it("skips canonical write scan for non-shell argv even when path appears in args", () => {
    process.env.ORGOS_FS_GUARD = "enforce";
    expect(() =>
      assertShellCommandAvoidsCanonicalWrites([
        "echo",
        "see docs/quickstart.md for data/finance/cash-balance.yaml",
      ])
    ).not.toThrow();
  });

  it("blocks install onto canonical paths via shell interpreter", () => {
    process.env.ORGOS_FS_GUARD = "enforce";
    expect(() =>
      assertShellCommandAvoidsCanonicalWrites([
        "bash",
        "-lc",
        "install -m 644 /tmp/x data/finance/cash-balance.yaml",
      ])
    ).toThrow(/canonical/);
  });

  it("rejects cwd outside tenant", () => {
    expect(() => assertDispatchCwdWithinTenant("/tmp")).toThrow(/escapes tenant/);
  });

  it("rejects unknown shell profile", () => {
    const root = tenantDispatchRoot();
    expect(() =>
      buildShellCommand(
        { promptPath: "/tmp/p.md", workspace: root, tenant: "demo", tenantRoot: root },
        "not-a-real-profile"
      )
    ).toThrow(/Unknown shell profile/);
  });

  it("blocks --yes in production without ORGOS_SHELL_AUTO_YES", () => {
    process.env.ORGOS_ENV = "production";
    const resolved: ResolvedShellCommand = {
      command: ["aider", "--yes", "--message-file", "/tmp/x.md"],
      cwd: tenantDispatchRoot(),
      env: {},
      timeoutMs: 1000,
    };
    expect(() => assertResolvedShellCommandSafe(resolved)).toThrow(/ORGOS_SHELL_AUTO_YES/);
    expect(isProdSecurityMode()).toBe(true);
  });

  it("rejects interpreter binaries outside runtime allowlist when enforced", () => {
    process.env.ORGOS_FS_GUARD = "enforce";
    expect(() => assertShellCommandAllowlist(["python", "-c", "open('data/x','w')"])).toThrow(
      /allowlist/
    );
    expect(() => assertShellCommandAllowlist(["echo", "ok"])).not.toThrow();
    expect(() => assertShellCommandAllowlist(["aider", "--message-file", "/tmp/x"])).not.toThrow();
  });
});
