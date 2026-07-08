import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { validateProtocolState } from "../src/lib/protocol/validate.js";
import { getWitnessPoolYamlPath } from "../src/lib/protocol/paths.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol validate standalone", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    writeFileSync(
      getWitnessPoolYamlPath(),
      "enabled: false\nquorum:\n  mode: any_of_n\nhubs: []\n",
      "utf-8"
    );
  });

  afterEach(() => cleanup());

  it("passes with no peers and witness disabled", () => {
    const result = validateProtocolState({ standalone: true });
    expect(result.ok).toBe(true);
  });

  it("fails standalone when peers are configured", () => {
    registerPeer({ peer_id: "PEER-001", display_name: "Peer", jurisdiction: "JP" });
    const result = validateProtocolState({ standalone: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "standalone-peers-configured")).toBe(true);
  });
});
