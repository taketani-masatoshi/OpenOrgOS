import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getMailReceivedDir } from "../src/lib/correspondence/paths.js";
import { getMailTriageQueuePath } from "../src/lib/correspondence/paths.js";
import {
  classifyMail,
  triageEmlFile,
  triageUnprocessedMail,
} from "../src/lib/correspondence/mail-triage.js";
import { loadMailTriageQueue } from "../src/lib/correspondence/mail-triage-queue.js";
import { loadMailTriageRules } from "../src/lib/correspondence/mail-triage-rules.js";

const fixturesDir = join(import.meta.dirname, "fixtures/mail");

function cleanup(): void {
  for (const p of [join(getDataDir(), "executive"), join(getDataDir(), "correspondence")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  const received = getMailReceivedDir();
  if (existsSync(received)) rmSync(received, { recursive: true, force: true });
}

describe("correspondence mail triage", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "executive"), { recursive: true });
    mkdirSync(getMailReceivedDir(), { recursive: true });
    writeFileSync(getMailTriageQueuePath(), "version: 1\nentries: []\n", "utf-8");
  });

  afterEach(() => cleanup());

  it("classifies invoice mail as p1 ham secretary", () => {
    const rules = loadMailTriageRules();
    const result = classifyMail(
      {
        from: "vendor@example.com",
        subject: "請求書のご送付",
        receivedAt: "2026-07-10T08:00:00+09:00",
        textPreview: "",
      },
      rules
    );
    expect(result.disposition).toBe("ham");
    expect(result.importance).toBe("p1");
    expect(result.routing).toBe("secretary");
  });

  it("classifies newsletter as spam ignore", () => {
    const rules = loadMailTriageRules();
    const result = classifyMail(
      {
        from: "noreply@newsletter.example",
        subject: "Weekly digest unsubscribe",
        receivedAt: "2026-07-10T09:00:00+09:00",
        textPreview: "",
      },
      rules
    );
    expect(result.disposition).toBe("spam");
    expect(result.routing).toBe("ignore");
  });

  it("triages eml into queue without body content", async () => {
    const filename = "MSG-20260710-test.eml";
    copyFileSync(join(fixturesDir, "sample.eml"), join(getMailReceivedDir(), filename));

    const { entry } = await triageEmlFile(filename, { identifySender: false });
    expect(entry.subject).toBe("請求書のご送付");
    expect(entry.eml_ref).toBe(`records/executive/mail-received/${filename}`);

    const queue = loadMailTriageQueue();
    expect(queue.entries).toHaveLength(1);
    const yaml = readFileSync(getMailTriageQueuePath(), "utf-8");
    expect(yaml).not.toMatch(/お世話になっております/);
  });

  it("batch triage processes only new files", async () => {
    copyFileSync(
      join(fixturesDir, "sample.eml"),
      join(getMailReceivedDir(), "MSG-a.eml")
    );
    copyFileSync(
      join(fixturesDir, "spam-sample.eml"),
      join(getMailReceivedDir(), "MSG-b.eml")
    );

    const result = await triageUnprocessedMail({ identifySender: false });
    expect(result.processed).toBe(2);

    const queue = loadMailTriageQueue();
    expect(queue.entries).toHaveLength(2);
    const spam = queue.entries.find((e) => e.disposition === "spam");
    expect(spam?.routing).toBe("ignore");
  });
});
