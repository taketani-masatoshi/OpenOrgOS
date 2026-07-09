import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  collectContactRegistryCandidates,
  registerContact,
  resolveContactRegistry,
  resolveEmailFromContactRef,
} from "../src/lib/secretary/contact-registry.js";

function seedExecutiveContacts(): void {
  const execDir = join(getDataDir(), "executive");
  mkdirSync(execDir, { recursive: true });

  writeFileSync(
    join(execDir, "external-contacts.yaml"),
    YAML.stringify({
      contacts: [
        {
          id: "EXT-001",
          name: "山田太郎",
          org: "サンプル商事",
          department: "営業部",
          email: "yamada@sample.co.jp",
        },
      ],
    }),
    "utf-8"
  );

  writeFileSync(
    join(execDir, "stakeholders.yaml"),
    YAML.stringify({
      stakeholders: [
        {
          id: "STK-001",
          name: "サンプル商事",
          org: "サンプル商事",
          representative_contact: {
            name: "山田太郎",
            role: "部長",
            department: "営業部",
            email: "rep@sample.co.jp",
          },
        },
      ],
    }),
    "utf-8"
  );
}

function cleanup(): void {
  const execDir = join(getDataDir(), "executive");
  if (existsSync(execDir)) rmSync(execDir, { recursive: true, force: true });
}

describe("secretary contact registry", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    seedExecutiveContacts();
  });

  afterEach(() => cleanup());

  it("resolves by name and department from external-contacts", () => {
    const result = resolveContactRegistry({
      name: "山田",
      department: "営業",
    });
    expect(result.found).toBe(true);
    expect(result.matches.some((m) => m.email === "yamada@sample.co.jp")).toBe(true);
  });

  it("includes stakeholders representative_contact in candidates", () => {
    const candidates = collectContactRegistryCandidates();
    expect(
      candidates.some(
        (m) => m.source.includes("stakeholders.yaml") && m.email === "rep@sample.co.jp"
      )
    ).toBe(true);
  });

  it("registers new contact and syncs stakeholder", () => {
    const result = registerContact({
      name: "鈴木花子",
      org: "サンプル商事",
      department: "経理部",
      email: "suzuki@sample.co.jp",
      stakeholderId: "STK-001",
    });

    expect(result.created).toBe(true);
    expect(result.extId).toMatch(/^EXT-/);
    expect(result.stakeholderSynced).toBe(true);

    const lookup = resolveContactRegistry({ name: "鈴木", department: "経理" });
    expect(lookup.found).toBe(true);
    expect(lookup.matches.some((m) => m.email === "suzuki@sample.co.jp")).toBe(true);
  });

  it("resolves email from contact-ref via stakeholder fallback", () => {
    writeFileSync(
      join(getDataDir(), "executive", "external-contacts.yaml"),
      YAML.stringify({
        contacts: [
          {
            id: "EXT-002",
            name: "山田太郎",
            org: "サンプル商事",
            stakeholder_id: "STK-001",
          },
        ],
      }),
      "utf-8"
    );

    expect(resolveEmailFromContactRef("EXT-002")).toBe("rep@sample.co.jp");
  });
});
