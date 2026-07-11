import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { upsertTriageEntry } from "../src/lib/correspondence/mail-triage-queue.js";
import {
  identifySenderForTriageEntry,
  confirmSenderFromCeo,
  registerConfirmedSender,
} from "../src/lib/correspondence/sender-identification.js";
import { loadSenderIdentificationQueue } from "../src/lib/correspondence/sender-identification-queue.js";
import { loadMailTriageQueue } from "../src/lib/correspondence/mail-triage-queue.js";
import { resolveMailSender } from "../src/lib/correspondence/sender-resolution.js";

function cleanup(): void {
  const exec = join(getDataDir(), "executive");
  if (existsSync(exec)) rmSync(exec, { recursive: true, force: true });
  const company = join(getDataDir(), "company.yaml");
  if (existsSync(company)) rmSync(company, { force: true });
}

describe("correspondence sender identification", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "executive"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "company.yaml"),
      [
        "name: Demo Corp",
        "representative: 山田太郎",
        "public_disclosure:",
        "  representative_email: ceo@demo.example",
        "  contact_email: info@demo.example",
      ].join("\n"),
      "utf-8"
    );
    writeFileSync(
      join(getDataDir(), "executive", "external-contacts.yaml"),
      "contacts: []\n",
      "utf-8"
    );
    writeFileSync(
      join(getDataDir(), "executive", "sender-identification-queue.yaml"),
      "version: 1\nentries: []\n",
      "utf-8"
    );
    writeFileSync(
      join(getDataDir(), "executive", "mail-triage-queue.yaml"),
      "version: 1\nentries: []\n",
      "utf-8"
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          AbstractText: "Sample person works at Example Inc.",
          Heading: "Sample Person",
          AbstractURL: "https://example.com/person",
          RelatedTopics: [],
        }),
      }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("marks known internal sender from company.yaml email", () => {
    const resolved = resolveMailSender("山田太郎 <ceo@demo.example>");
    expect(resolved.known).toBe(true);
    expect(resolved.internalDomain).toBe(true);
    expect(resolved.scope).toBe("internal");
  });

  it("runs web search and CEO question for unknown sender", async () => {
    const entry = upsertTriageEntry({
      id: "MSG-20260710-unknown",
      received_at: "2026-07-10T10:00:00+09:00",
      from: "Unknown Person <stranger@gmail.com>",
      subject: "Hello",
      eml_ref: "records/executive/mail-received/MSG-20260710-unknown.eml",
    });

    const result = await identifySenderForTriageEntry(entry);
    expect(result.action).toBe("ceo_asked");
    expect(result.triage.sender_known).toBe(false);
    expect(result.triage.identification_status).toBe("pending_ceo");

    const queue = loadSenderIdentificationQueue();
    expect(queue.entries).toHaveLength(1);
    expect(queue.entries[0]?.web_search?.hits.length).toBeGreaterThan(0);
    expect(queue.entries[0]?.ceo_question?.escalate_path).toBeTruthy();
  });

  it("registers contact after CEO confirm", async () => {
    const entry = upsertTriageEntry({
      id: "MSG-20260710-reg",
      received_at: "2026-07-10T10:00:00+09:00",
      from: "Jane Doe <jane@partner.example>",
      subject: "Partnership",
      eml_ref: "records/executive/mail-received/MSG-20260710-reg.eml",
    });

    await identifySenderForTriageEntry(entry, { skipCeoAsk: true });
    confirmSenderFromCeo({
      mailId: entry.id,
      name: "Jane Doe",
      org: "Partner Inc",
      role: "BD Manager",
      relationship: "取引先",
      confirmedBy: "ceo",
    });

    const { extId } = registerConfirmedSender(entry.id);
    expect(extId).toMatch(/^EXT-/);

    const triage = loadMailTriageQueue().entries.find((e) => e.id === entry.id);
    expect(triage?.sender_known).toBe(true);
    expect(triage?.identification_status).toBe("registered");
  });
});
