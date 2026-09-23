import { describe, expect, it } from "vitest";
import {
  formatSchedulingEmptyList,
  formatSchedulingListLine,
  formatSchedulingNewResult,
  formatSchedulingProposeResult,
  formatSchedulingRespondResult,
} from "../src/commands/scheduling-coordination-render.js";
import { schedulingCase } from "./helpers/scheduling-fixture.js";

describe("scheduling CLI render (pure)", () => {
  it("formats list / new / propose / respond without I/O", () => {
    const row = schedulingCase("SCH-2026-001");
    expect(formatSchedulingEmptyList()).toMatchInlineSnapshot(`"(no scheduling cases)"`);
    expect(formatSchedulingListLine(row)).toMatchInlineSnapshot(
      `"SCH-2026-001 · 統合日程調整 · awaiting_responses · next=候補日時を生成 · participants=4"`
    );
    expect(formatSchedulingNewResult({ ...row, status: "open", next_action: "propose_slots" }))
      .toMatchInlineSnapshot(`
      "✓ SCH-2026-001 · 統合日程調整
        next: 候補日時を生成
        run: orgos executive scheduling propose --id SCH-2026-001"
    `);
    expect(formatSchedulingProposeResult(row)).toMatchInlineSnapshot(`
      "✓ SCH-2026-001 · 2 slots
        SLOT-001: 2026-08-20 10:00
        SLOT-002: 2026-08-21 10:00
        next: 候補日時を生成"
    `);
    expect(formatSchedulingRespondResult({ ...row, next_action: "ceo_confirm" })).toMatchInlineSnapshot(
      `"✓ SCH-2026-001 · next=CEO 確認"`
    );
  });
});
