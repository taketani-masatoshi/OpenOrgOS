import { beforeEach, describe, expect, it } from "vitest";
import {
  buildHeadcountView,
  formatHeadcountMarkdown,
} from "../src/lib/hr/headcount-view.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("hr headcount view", () => {
  it("counts active employees for mal (no names in markdown)", () => {
    setTenantId("mal");
    const view = buildHeadcountView();
    expect(view.coverage).toBe("registered");
    expect(view.by_status.active).toBe(4);
    expect(view.on_roster).toBe(4);
    expect(view.total).toBe(4);
    expect(view.source_path).toBe("data/hr/employees.yaml");
    expect(view.consistency_warnings.length).toBeGreaterThan(0);
    expect(
      view.consistency_warnings.every((w) => w.level === "warning"),
    ).toBe(true);
    const md = formatHeadcountMarkdown(view);
    expect(md).toContain("**4**");
    expect(md).toContain("警告と修正案");
    expect(md).not.toMatch(/段燕燕|宮城|三塚|鈴木/);
  });

  it("marks southwood as unregistered when employees.yaml is empty", () => {
    setTenantId("southwood");
    const view = buildHeadcountView();
    expect(view.coverage).toBe("unregistered");
    expect(view.total).toBe(0);
    expect(view.on_roster).toBe(0);
    expect(view.notes.some((n) => /未登録/.test(n))).toBe(true);
  });
});
