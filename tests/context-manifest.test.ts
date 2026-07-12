import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildActiveContextMarkdown,
  loadEnabledIsoIds,
  syncActiveContext,
} from "../src/lib/context-manifest.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("context-manifest", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("loads enabled ISO for mal tenant", () => {
    const ids = loadEnabledIsoIds();
    expect(ids).toContain("ISO-9001");
    expect(ids).toContain("ISO-27001");
    expect(ids).not.toContain("ISO-22301");
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
