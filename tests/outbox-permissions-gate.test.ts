import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { getInstallRoot } from "../src/lib/orgos-paths.js";

describe("outbox permissions production gate (O2-2)", () => {
  it("outbox-permissions module supports STEWARD_ENFORCE_OUTBOX_PERMISSIONS", async () => {
    const mod = await import("../src/lib/protocol/outbox-permissions.js");
    expect(typeof mod.checkProtocolOutboxPermissionsLoose).toBe("function");
    const script = join(getInstallRoot(), "deploy/protocol-outbox/apply-permissions.sh");
    expect(existsSync(script)).toBe(true);
  });
});
