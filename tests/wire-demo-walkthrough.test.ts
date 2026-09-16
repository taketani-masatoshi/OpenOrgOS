import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildWireDemoWalkthrough } from "../src/lib/wire-demo/build-walkthrough.js";
import {
  operatorShellTabFromRoute,
  pathActive,
  spaPathFromHref,
} from "../apps/steward-chat/src/console-routing.js";

describe("buildWireDemoWalkthrough", () => {
  it("returns MAL↔Southwood story steps for mal", () => {
    setTenantId("mal");
    const demo = buildWireDemoWalkthrough();
    expect(demo.ok).toBe(true);
    expect(demo.tenant).toBe("mal");
    expect(demo.steps.length).toBeGreaterThanOrEqual(5);
    expect(demo.steps.map((s) => s.id)).toEqual(
      expect.arrayContaining(["peer", "propose", "approve", "deliver", "ack"]),
    );
    expect(demo.wire_console_href).toBe("/wire/");
    expect(demo.approvals_href).toBe("/approvals/");
    expect(demo.peers.some((p) => /southwood/i.test(p.display_name + p.org_uri))).toBe(
      true,
    );
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
