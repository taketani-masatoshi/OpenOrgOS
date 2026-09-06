import { describe, expect, it } from "vitest";
import {
  emptyDigestSlot,
  emptyDigestSlots,
} from "../apps/steward-chat/src/digestSlots.ts";

describe("live-section digest slots helpers", () => {
  it("emptyDigestSlot carries generate_hint for CLI write", () => {
    const slot = emptyDigestSlot("帳簿ダイジェスト", "orgos ledger digest --period weekly --write");
    expect(slot.path).toBeNull();
    expect(slot.markdown).toBeNull();
    expect(slot.title).toBe("帳簿ダイジェスト");
    expect(slot.generate_hint).toContain("orgos ledger digest");
  });

  it("emptyDigestSlots builds weekly and monthly placeholders", () => {
    const slots = emptyDigestSlots(
      "予算ダイジェスト",
      "orgos budget digest --period weekly --write",
      "orgos budget digest --period monthly --write",
    );
    expect(slots.weekly.generate_hint).toContain("--period weekly");
    expect(slots.monthly.generate_hint).toContain("--period monthly");
    expect(slots.weekly.title).toBe(slots.monthly.title);
  });
});
