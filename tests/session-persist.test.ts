import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import {
  createDevSession,
  getSessionUser,
  resetSessionsForTests,
} from "../src/lib/wire-console/auth/session.js";
import { sessionStorePath } from "../src/lib/console-auth/session-store.js";

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
});
