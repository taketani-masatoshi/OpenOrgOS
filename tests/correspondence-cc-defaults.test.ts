import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { getExecutiveRecordsDir, getMailConfigPath } from "../src/lib/correspondence/paths.js";
import { resolveDefaultCorrespondenceCc } from "../src/lib/correspondence/cc-defaults.js";
import { createCorrespondenceDraft } from "../src/lib/correspondence/draft.js";

function seedCompanyAndMail(): void {
  const companyPath = join(getDataDir(), "company.yaml");
  writeFileSync(
    companyPath,
    YAML.stringify({
      name: "Test Co",
      public_disclosure: {
        contact_email: "ceo@test.co.jp",
        representative_email: "secretary@test.co.jp",
        correspondence_cc: ["oversight@test.co.jp"],
      },
    }),
    "utf-8"
  );
  mkdirSync(getExecutiveRecordsDir(), { recursive: true });
  writeFileSync(
    getMailConfigPath(),
    YAML.stringify({
      provider: "smtp",
      from: { name: "Secretary", email: "secretary@test.co.jp" },
      smtp: { host: "smtp.test.local", port: 587, secure: false },
      outbound: {
        cc_defaults: [{ email: "ceo@test.co.jp", role: "ceo" }],
      },
    }),
    "utf-8"
  );
}


function seedContact(email = "partner@example.com"): void {
  const execDir = join(getDataDir(), "executive");
  mkdirSync(execDir, { recursive: true });
  writeFileSync(
    join(execDir, "external-contacts.yaml"),
    YAML.stringify({ contacts: [{ id: "EXT-001", name: "Partner", org: "Example", email }] }),
    "utf-8",
  );
}

function cleanup(): void {
  for (const p of [
    join(getDocsDir(), "executive", "correspondence-drafts"),
    getExecutiveRecordsDir(),
    join(getDataDir(), "company.yaml"),
    join(getDataDir(), "executive", "external-contacts.yaml"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("correspondence cc defaults", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    seedCompanyAndMail();
    seedContact();
  });
  afterEach(() => cleanup());

  it("adds oversight CC when secretary address sends externally", () => {
    const result = resolveDefaultCorrespondenceCc({
      to: "partner@example.com",
    });
    expect(result.cc).toContain("ceo@test.co.jp");
    expect(result.cc).toContain("oversight@test.co.jp");
    expect(result.appliedDefaults.length).toBeGreaterThan(0);
  });

  it("does not CC the primary recipient or from address", () => {
    const result = resolveDefaultCorrespondenceCc({
      to: "ceo@test.co.jp",
    });
    expect(result.cc).not.toContain("ceo@test.co.jp");
    expect(result.cc).toContain("oversight@test.co.jp");
  });

  it("merges explicit CC with defaults without duplicates", () => {
    const result = resolveDefaultCorrespondenceCc({
      to: "partner@example.com",
      explicitCc: "finance@test.co.jp, ceo@test.co.jp",
    });
    const parts = result.cc!.split(/,\s*/);
    expect(parts.filter((p) => p === "ceo@test.co.jp")).toHaveLength(1);
    expect(parts).toContain("finance@test.co.jp");
  });

  it("applies defaults on draft create", () => {
    const { draft } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "Hello",
      body: "Body",
      createdBy: "secretary",
      proposeApproval: false,
    });
    expect(draft.cc).toContain("ceo@test.co.jp");
  });

  it("skips defaults with skipCcDefaults", () => {
    const { draft } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "Hello",
      body: "Body",
      createdBy: "secretary",
      proposeApproval: false,
      skipCcDefaults: true,
    });
    expect(draft.cc).toBeUndefined();
  });
});
