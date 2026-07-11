import { describe, expect, it } from "vitest";
import { parseSecretaryDraftTone } from "../src/lib/secretary/tenant-behavior.js";

describe("secretary tenant behavior", () => {
  it("parses scheduling draft closings from secretary_behavior.md section", () => {
    const tone = parseSecretaryDraftTone(`
# Secretary
## 日程調整下書き
- 候補提示の結び: 何卒よろしくお願い申し上げます。
- リマインドの結び: お手数ですがご回答をお願いいたします。
- 確定通知の結び: 当日は何卒よろしくお願いいたします。
## その他
`);
    expect(tone).toEqual({
      proposalClosing: "何卒よろしくお願い申し上げます。",
      reminderClosing: "お手数ですがご回答をお願いいたします。",
      confirmClosing: "当日は何卒よろしくお願いいたします。",
    });
  });
});
