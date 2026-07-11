import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  findSchedulingChatDraft,
  handleSchedulingChatMessage,
} from "../src/lib/scheduling-coordination/chat-intent.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  cleanupSchedulingTenant,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";

const tenantId = "test-scheduling-chat";

describe("scheduling chat intake", () => {
  beforeEach(() => seedSchedulingTenant(tenantId));
  afterEach(() => cleanupSchedulingTenant(tenantId));

  it("creates one complete case in two turns and persists no placeholder case", () => {
    const first = handleSchedulingChatMessage("thread-quality-gate", "取締役会の日程調整をお願い");
    expect(first.caseRow).toBeUndefined();
    const before = YAML.parse(
      readFileSync(join(getDataDir(), "executive", "scheduling-cases.yaml"), "utf-8")
    );
    expect(before.cases).toEqual([]);

    const second = handleSchedulingChatMessage(
      "thread-quality-gate",
      "参加者は Alice <alice@example.com>、Bob <bob@example.com>、60分、オンライン"
    );
    expect(second.caseRow).toMatchObject({
      title: "取締役会",
      duration_minutes: 60,
      meeting_format: "online",
      source: "chat",
    });
    expect(second.caseRow?.participants).toHaveLength(2);
    expect(findSchedulingChatDraft("thread-quality-gate")?.status).toBe("completed");

    const persisted = YAML.parse(
      readFileSync(join(getDataDir(), "executive", "scheduling-cases.yaml"), "utf-8")
    );
    expect(persisted.cases).toHaveLength(1);
    expect(persisted.cases[0].id).toBe(second.caseRow?.id);
  });
});
