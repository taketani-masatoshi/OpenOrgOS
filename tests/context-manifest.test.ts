import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildActiveContextMarkdown,
  loadEnabledIsoIds,
  syncActiveContext,
} from "../src/lib/context-manifest.js";

describe("context-manifest", () => {
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
    expect(md).toContain("## 無効業務モジュール（読取禁止）");
    expect(md).toContain("`venture_capital`");
    expect(md).toContain("**読まない**");
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
