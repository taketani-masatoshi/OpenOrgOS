import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import {
  applyProtocolOutboxPermissions,
  checkProtocolOutboxPermissionsLoose,
} from "../src/lib/protocol/outbox-permissions.js";
import { getProtocolOutboxDir } from "../src/lib/protocol/paths.js";

describe("protocol outbox permissions", () => {
  const testFile = "perm-test-envelope.json";
  let priorOutboxMode: number | undefined;

  beforeEach(() => {
    setTenantId("demo");
    const outbox = getProtocolOutboxDir();
    mkdirSync(outbox, { recursive: true });
    if (existsSync(outbox)) {
      priorOutboxMode = statSync(outbox).mode;
    }
    writeFileSync(join(outbox, testFile), "{}", "utf-8");
  });

  afterEach(() => {
    const outbox = getProtocolOutboxDir();
    const path = join(outbox, testFile);
    if (existsSync(path)) unlinkSync(path);
    if (priorOutboxMode !== undefined && existsSync(outbox)) {
      chmodSync(outbox, priorOutboxMode);
    }
  });

  it("apply-permissions sets directory and file modes", () => {
    const result = applyProtocolOutboxPermissions();
    expect(result.applied.length).toBeGreaterThan(0);

    const outbox = getProtocolOutboxDir();
    expect(statSync(outbox).mode & 0o777).toBe(0o750);
    expect(statSync(join(outbox, testFile)).mode & 0o777).toBe(0o640);
  });

  it("flags world-accessible outbox as loose", () => {
    chmodSync(getProtocolOutboxDir(), 0o777);
    const issues = checkProtocolOutboxPermissionsLoose();
    expect(issues.some((i) => i.code === "outbox-world-writable")).toBe(true);
  });
});
