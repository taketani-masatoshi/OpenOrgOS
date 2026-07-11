import { describe, it, expect } from "vitest";
import { parseMailConfigObject } from "../src/lib/correspondence/mail-config-parse.js";

describe("mail-config parse", () => {
  it("accepts receive key", () => {
    const config = parseMailConfigObject({
      provider: "smtp",
      from: { name: "Co", email: "a@b.co" },
      receive: { sync: "imap", imap_host: "imap.example.com", imap_port: 993 },
    });
    expect(config.receive?.sync).toBe("imap");
    expect(config.receive?.imap_host).toBe("imap.example.com");
  });

  it("migrates legacy inbox key to receive", () => {
    const config = parseMailConfigObject({
      provider: "dry_run",
      from: { name: "Co", email: "a@b.co" },
      inbox: { sync: "stub", imap_host: "legacy.example.com" },
    });
    expect(config.receive?.sync).toBe("stub");
    expect(config.receive?.imap_host).toBe("legacy.example.com");
    expect("inbox" in config).toBe(false);
  });
});
