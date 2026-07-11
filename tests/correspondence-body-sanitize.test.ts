import { describe, it, expect } from "vitest";
import { sanitizeOutboundEmailBody } from "../src/lib/correspondence/body-sanitize.js";

describe("sanitizeOutboundEmailBody", () => {
  it("removes draft disclaimer footer before send", () => {
    const body = `竹谷様

よろしくお願いします。

※ 本メールは送信前の下書きです。送信には代表者の承認が必要です。
`;
    expect(sanitizeOutboundEmailBody(body)).not.toMatch(/送信前の下書き/);
    expect(sanitizeOutboundEmailBody(body)).toContain("竹谷様");
  });
});
