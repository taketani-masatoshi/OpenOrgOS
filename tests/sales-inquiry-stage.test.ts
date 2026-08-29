import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  canTransitionInquiry,
  setInquiryStatus,
  SalesInquiryStageError,
} from "../src/lib/sales-inquiry-stage.js";
import { loadSalesInquiries } from "../src/lib/data.js";

function cleanup(): void {
  const p = join(getDataDir(), "sales");
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

function seed(status: string): void {
  mkdirSync(join(getDataDir(), "sales", "inbound"), { recursive: true });
  writeFileSync(
    join(getDataDir(), "sales", "inbound", "inquiries.yaml"),
    YAML.stringify({
      version: 1,
      inquiries: [
        {
          id: "INQ-2026-030",
          received_on: "2026-08-01",
          subject: "Hello",
          company: "Stage Co",
          status,
          owner_name: "op",
        },
      ],
    }),
    "utf-8",
  );
}

describe("sales inquiry stage", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
  });

  afterEach(() => cleanup());

  it("allows legal transitions", () => {
    expect(canTransitionInquiry("new", "triaged")).toBe(true);
    expect(canTransitionInquiry("triaged", "qualified")).toBe(true);
    expect(canTransitionInquiry("qualified", "closed")).toBe(true);
  });

  it("blocks illegal transitions", () => {
    expect(canTransitionInquiry("new", "qualified")).toBe(false);
    expect(canTransitionInquiry("closed", "new")).toBe(false);
  });

  it("persists legal set-status", () => {
    seed("new");
    const next = setInquiryStatus({
      inquiryId: "INQ-2026-030",
      toStatus: "triaged",
      actor: "test",
    });
    expect(next.status).toBe("triaged");
    expect(loadSalesInquiries()?.inquiries[0]?.status).toBe("triaged");
  });

  it("throws on illegal set-status", () => {
    seed("new");
    expect(() =>
      setInquiryStatus({ inquiryId: "INQ-2026-030", toStatus: "qualified" }),
    ).toThrow(SalesInquiryStageError);
  });
});
