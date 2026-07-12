import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../src/lib/tenant.js";

/**
 * Relies on tests/setup-restore-protocol.ts beforeEach preserve behavior.
 * Markers written in one test must survive the next test's fixture restore.
 */
describe("mal protocol fixture preserve", () => {
  const protocolDir = join(ROOT_DIR, "tenants/mal/data/protocol");
  const transactionsPath = join(protocolDir, "transactions-registry.yaml");
  const peersPath = join(protocolDir, "peers.yaml");
  const mailConfigPath = join(
    ROOT_DIR,
    "tenants/mal/records/executive/mail-config.yaml"
  );
  const marker = `# preserve-marker-${process.pid}`;

  it("writes preserve markers into mal protocol + L2 mail-config", () => {
    mkdirSync(protocolDir, { recursive: true });
    mkdirSync(join(ROOT_DIR, "tenants/mal/records/executive"), { recursive: true });

    writeFileSync(
      transactionsPath,
      `as_of: "2099-01-01"\n# ${marker}\ntransactions: []\n`,
      "utf-8"
    );
    const peers = readFileSync(peersPath, "utf-8");
    if (!peers.includes(marker)) {
      writeFileSync(peersPath, `${peers.trimEnd()}\n# ${marker}\n`, "utf-8");
    }
    writeFileSync(
      mailConfigPath,
      `provider: dry_run\n# ${marker}\nfrom:\n  name: Preserve Test\n  email: preserve@test.local\n`,
      "utf-8"
    );

    expect(readFileSync(transactionsPath, "utf-8")).toContain(marker);
    expect(readFileSync(peersPath, "utf-8")).toContain(marker);
    expect(readFileSync(mailConfigPath, "utf-8")).toContain(marker);
  });

  it("keeps markers after setup-restore-protocol beforeEach", () => {
    expect(existsSync(transactionsPath)).toBe(true);
    expect(readFileSync(transactionsPath, "utf-8")).toContain(marker);
    expect(readFileSync(peersPath, "utf-8")).toContain(marker);
    expect(existsSync(mailConfigPath)).toBe(true);
    expect(readFileSync(mailConfigPath, "utf-8")).toContain(marker);

    // Restore pilot-clean artifacts for subsequent suites.
    writeFileSync(transactionsPath, `as_of: "2026-07-12"\ntransactions: []\n`, "utf-8");
    writeFileSync(
      peersPath,
      readFileSync(peersPath, "utf-8")
        .split("\n")
        .filter((line) => !line.includes("preserve-marker-"))
        .join("\n"),
      "utf-8"
    );
    writeFileSync(
      mailConfigPath,
      (() => {
        const example = join(
          ROOT_DIR,
          "tenants/mal/records/executive/mail-config.mal-pilot.yaml.example"
        );
        if (existsSync(example)) return readFileSync(example, "utf-8");
        return `provider: smtp\nfrom:\n  name: MAL\n  email: ai@malkk.com\nreceive:\n  sync: imap\n  auto_wire_scan: true\nwire_outbound:\n  enabled: true\n  from:\n    name: Wire\n    email: ai@malkk.com\n  smtp:\n    host: sv16463.xserver.jp\n    port: 587\n    secure: false\n`;
      })(),
      "utf-8"
    );
  });
});
