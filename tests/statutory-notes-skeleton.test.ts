import { describe, expect, it } from "vitest";
import {
  statutoryNoteHeadings,
  STATUTORY_NOTE_SPECS,
} from "../src/lib/finance/ledger/statutory-statements.js";

describe("statutory notes skeleton", () => {
  it("exports the required ordinance note headings", () => {
    const headings = statutoryNoteHeadings();
    expect(headings.length).toBe(STATUTORY_NOTE_SPECS.length);
    expect(headings).toEqual([
      "継続企業の前提に関する注記",
      "重要な会計方針に係る事項に関する注記",
      "表示方法の変更に関する注記",
      "税効果会計に関する注記",
      "関連当事者との取引に関する注記",
      "一株当たり情報に関する注記",
      "重要な後発事象に関する注記",
    ]);
    expect(new Set(headings).size).toBe(headings.length);
  });
});
