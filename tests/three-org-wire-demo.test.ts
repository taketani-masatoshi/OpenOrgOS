import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { runThreeOrgWireDemo } from "../scripts/lib/three-org-wire-demo.js";

describe("three-org wire demo", () => {
  it(
    "mal ↔ southwood inter-org + mesh to aiac",
    async () => {
      const result = await runThreeOrgWireDemo();
      expect(result.interOrgEventId).toBeTruthy();
      expect(result.meshEventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(existsSync(result.meshInboxPath)).toBe(true);
      expect(result.postOrder).toEqual(["PEER-004", "PEER-003"]);
      const inbox = JSON.parse(readFileSync(result.meshInboxPath, "utf-8"));
      expect(inbox.event_id).toBe(result.meshEventId);
    },
    120_000
  );
});
