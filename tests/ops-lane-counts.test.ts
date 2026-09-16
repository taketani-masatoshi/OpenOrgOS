import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";

vi.mock("../src/lib/correspondence/draft.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/correspondence/draft.js")>();
  return {
    ...actual,
    listCorrespondenceDrafts: vi.fn(),
  };
});

vi.mock("../src/lib/steward-chat/today-context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/steward-chat/today-context.js")>();
  return {
    ...actual,
    buildTodayContext: vi.fn(),
  };
});

import { listCorrespondenceDrafts } from "../src/lib/correspondence/draft.js";
import { buildTodayContext } from "../src/lib/steward-chat/today-context.js";
import { collectOpsLaneCounts } from "../src/lib/ops-lane-counts.js";
import { buildExecutiveHome } from "../src/lib/executive-home/build-home.js";

const listDraftsMock = vi.mocked(listCorrespondenceDrafts);
const buildTodayMock = vi.mocked(buildTodayContext);

describe("collectOpsLaneCounts drafts", () => {
  beforeEach(() => {
    setTenantId("demo");
    listDraftsMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports the full draft count when there are more than 50 drafts", () => {
    const drafts = Array.from({ length: 51 }, (_, i) => ({
      draft_id: `DRAFT-20260916-${String(i + 1).padStart(3, "0")}`,
      status: "draft" as const,
      subject: `Synthetic draft ${i + 1}`,
      to: "ops@example.test",
      created_at: "2026-09-16T00:00:00Z",
    }));
    listDraftsMock.mockReturnValue(drafts as ReturnType<typeof listCorrespondenceDrafts>);

    const counts = collectOpsLaneCounts();
    expect(counts.workbench_ok).toBe(true);
    expect(counts.drafts).toBe(51);
    expect(counts.drafts).not.toBe(50);
  });
});

describe("buildExecutiveHome Today failure", () => {
  beforeEach(() => {
    setTenantId("demo");
    buildTodayMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns null finance runway/cash when Today context construction fails", () => {
    buildTodayMock.mockImplementation(() => {
      throw new Error("synthetic today failure");
    });

    const home = buildExecutiveHome();
    expect(home.ok).toBe(true);
    expect(home.finance_runway_months).toBeNull();
    expect(home.finance_cash_balance).toBeNull();
  });
});
