import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildActiveContextMarkdown,
  loadEnabledIsoIds,
  syncActiveContext,
} from "../src/lib/context-manifest.js";
import { loadTenantStandards } from "../src/lib/tenant-standards.js";

describe("context-manifest", () => {
  it("loads only the standards the tenant enabled", () => {
    // Which standards MAL certifies against is a business decision that can
    // change, so assert the filter works rather than a fixed list.
    const ids = loadEnabledIsoIds();
    const declared = loadTenantStandards();
    const enabled = declared.iso.filter((e) => e.enabled).map((e) => e.id);
    const disabled = declared.iso.filter((e) => !e.enabled).map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    expect([...ids].sort()).toEqual([...enabled].sort());
    for (const id of disabled) expect(ids).not.toContain(id);
  });

  it("active context lists enabled modules and forbids disabled", () => {
    const md = buildActiveContextMarkdown();
    expect(md).toContain("## 有効業務モジュール");
    expect(md).toContain("`rental`");
    expect(md).toContain("`hospitality`");
    expect(md).toContain("## 有効社内規程");
    expect(md).toContain("REG-012");
    expect(md).toContain("## 無効業務モジュール（読取禁止）");
    expect(md).toContain("`venture_capital`");
    expect(md).toContain("**読まない**");
  });

  it("active context includes Secretary executive read surface", () => {
    const md = buildActiveContextMarkdown();
    expect(md).toContain("## Secretary 読取面");
    expect(md).toContain("data/executive/calendar.yaml");
    expect(md).toContain("correspondence-drafts");
    expect(md).toContain("Executive Steward は **読まない**");
  });

  it("sync writes active_context and cursor rule", () => {
    const { contextPath, cursorRulePath } = syncActiveContext();
    expect(existsSync(contextPath)).toBe(true);
    expect(existsSync(cursorRulePath)).toBe(true);
    const ctx = readFileSync(contextPath, "utf-8");
    expect(ctx).toContain("トークン節約");
    const rule = readFileSync(cursorRulePath, "utf-8");
    expect(rule).toContain("alwaysApply: true");
  });
});
