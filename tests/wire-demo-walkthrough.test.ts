import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  buildWireDemoWalkthrough,
  isSouthwoodPeer,
} from "../src/lib/wire-demo/build-walkthrough.js";
import {
  operatorShellTabFromRoute,
  pathActive,
  spaPathFromHref,
} from "../apps/steward-chat/src/console-routing.js";

describe("buildWireDemoWalkthrough", () => {
  it("returns MAL↔Southwood story steps with real action hrefs", () => {
    setTenantId("mal");
    const demo = buildWireDemoWalkthrough();
    expect(demo.ok).toBe(true);
    expect(demo.tenant).toBe("mal");
    expect(demo.steps.map((s) => s.id)).toEqual(
      expect.arrayContaining(["peer", "propose", "approve", "deliver", "ack"]),
    );
    const peer = demo.steps.find((s) => s.id === "peer");
    expect(peer?.href).toBe("/wire/");
    expect(peer?.href).not.toBe("/wire/demo/");
    const propose = demo.steps.find((s) => s.id === "propose");
    expect(propose?.href).toBe("/secretary/workbench/");
    const approve = demo.steps.find((s) => s.id === "approve");
    expect(approve?.href).toBe("/approvals/");
    expect(demo.peers.some((p) => isSouthwoodPeer(p))).toBe(true);
  });

  it("does not treat PEER-001 alone as Southwood", () => {
    expect(
      isSouthwoodPeer({
        peer_id: "PEER-001",
        display_name: "Other Co",
        org_uri: "steward://tenant/other",
      }),
    ).toBe(false);
    expect(
      isSouthwoodPeer({
        peer_id: "PEER-009",
        display_name: "Southwood Inc",
        org_uri: "steward://tenant/southwood",
      }),
    ).toBe(true);
  });
});

describe("console-routing wire demo", () => {
  it("resolves /wire/demo/ before /wire/", () => {
    expect(pathActive("/wire/demo")).toBe("wire-demo");
    expect(pathActive("/wire/demo/")).toBe("wire-demo");
    expect(pathActive("/wire/")).toBe("wire");
    expect(operatorShellTabFromRoute("wire-demo")).toBe("wire");
    expect(spaPathFromHref("/wire/demo/", "http://localhost")).toBe("/wire/demo/");
  });
});
