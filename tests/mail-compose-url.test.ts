import { describe, it, expect } from "vitest";
import { buildGmailComposeUrl } from "../src/lib/mail-compose-url.js";

describe("mail compose url", () => {
  it("builds gmail compose link", () => {
    const url = buildGmailComposeUrl({
      to: "partner@example.com",
      subject: "Hello",
      body: "Line1\nLine2",
    });
    expect(url).toContain("mail.google.com");
    expect(url).toContain("partner%40example.com");
    expect(url).toContain("Hello");
  });
});
