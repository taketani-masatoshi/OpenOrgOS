import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import { listDiscoverablePeers } from "../src/lib/protocol/peer-discovery.js";
import {
  rotateProtocolSigningKey,
  exportProtocolPublicKeyBase64,
} from "../src/lib/protocol/signing.js";
import { validateTrustedHubsRegistry } from "../src/lib/protocol/trusted-hubs.js";
import {
  runProtocolPeerDiscover,
  runProtocolSigningRotate,
  runProtocolTrustedHubsValidate,
} from "../src/commands/protocol.js";

describe("protocol gap closure", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("lists discoverable peers and trusted hub catalog", () => {
    const entries = listDiscoverablePeers({ jurisdiction: "JP" });
    expect(entries.some((e) => e.source === "trusted-hub-catalog")).toBe(true);
  });

  it("runProtocolPeerDiscover outputs JSON", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runProtocolPeerDiscover({ jurisdiction: "JP", json: true });
    const data = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(data.jurisdiction).toBe("JP");
    expect(Array.isArray(data.entries)).toBe(true);
  });

  it("validates trusted hubs registry on platform catalog", () => {
    const result = validateTrustedHubsRegistry();
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("runProtocolTrustedHubsValidate succeeds on platform registry", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runProtocolTrustedHubsValidate({});
    expect(spy).toHaveBeenCalledWith("✓ Trusted hubs registry OK");
    spy.mockRestore();
  });

  it("rotates signing key and exports new public key", () => {
    const before = exportProtocolPublicKeyBase64();
    const rotated = rotateProtocolSigningKey();
    expect(rotated.publicKey).toBeTruthy();
    if (before) {
      expect(rotated.publicKey).not.toBe(before);
    }
    expect(exportProtocolPublicKeyBase64()).toBe(rotated.publicKey);

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runProtocolSigningRotate({ json: true });
    const data = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(data.publicKey).toBeTruthy();

    if (rotated.backupPath && existsSync(rotated.backupPath)) {
      rmSync(rotated.backupPath, { force: true });
    }
  });
});
