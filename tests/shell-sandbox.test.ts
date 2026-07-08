import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { tenantDispatchRoot, assertDispatchCwdWithinTenant } from "../src/lib/org-boundary.js";
import { buildShellCommand } from "../src/lib/operator-runtime/config.js";
import { assertResolvedShellCommandSafe } from "../src/lib/operator-runtime/shell.js";
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

  it("uses tenant root for shell cwd placeholder", () => {
    const root = tenantDispatchRoot();
    const resolved = buildShellCommand({
      promptPath: "/tmp/prompt.md",
      workspace: root,
      tenant: "demo",
      tenantRoot: root,
    });
    expect(resolved?.cwd).toBe(root);
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
});
