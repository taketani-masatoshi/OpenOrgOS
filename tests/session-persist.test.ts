import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import {
  createDevSession,
  getSessionUser,
  registerSession,
  resetSessionsForTests,
} from "../src/lib/wire-console/auth/session.js";
import { sessionStorePath } from "../src/lib/console-auth/session-store.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("session persistence", () => {
  const env = { ...process.env };

  beforeEach(() => {
    resetSessionsForTests();
    process.env.ORGOS_SESSION_PERSIST = "1";
    const path = sessionStorePath();
    if (existsSync(path)) rmSync(path, { force: true });
  });

  afterEach(() => {
    process.env = { ...env };
    resetSessionsForTests();
    setTenantId("demo");
    const path = sessionStorePath();
    if (existsSync(path)) rmSync(path, { force: true });
  });

  it("persists session to disk and reloads on lookup", () => {
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "persist-test";
    const created = createDevSession({ passkey: "persist-test" });
    if ("error" in created) throw new Error(created.error);

    expect(existsSync(sessionStorePath())).toBe(true);
    const user = getSessionUser(created.token);
    expect(user?.operator_id).toBeTruthy();
    expect(getSessionUser(created.token)?.approver_id).toBe(user?.approver_id);
  });

  it("binds demo OP-001 to the registry approver after password login", () => {
    setTenantId("demo");
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "orgos-dev";
    const created = createDevSession({
      passkey: "orgos-dev",
      operator_id: "OP-001",
      approver_id: "段燕燕",
    });
    if ("error" in created) throw new Error(created.error);
    expect(created.user.operator_id).toBe("OP-001");
    expect(created.user.approver_id).toBe("Demo CEO");
  });

  it("rebinding a stale Demo CEO session to mal OP-001 registry name", () => {
    setTenantId("mal");
    const created = registerSession({
      operator_id: "OP-001",
      approver_id: "Demo CEO",
      mode: "dev",
    });
    expect(created.user.operator_id).toBe("OP-001");
    expect(created.user.approver_id).not.toBe("Demo CEO");
    expect(getSessionUser(created.token)?.approver_id).toBe(created.user.approver_id);
  });
});
