import { describe, it, expect } from "vitest";
import { lintCompanyEventMarkdown } from "../src/lib/company-events-lint.js";
import type { CompanyEvent } from "../schemas/company-events.js";

const event: CompanyEvent = {
  id: "EVT-20260626-registration-mal-shogo",
  occurred_at: "2026-06-26",
  month: "2026-06",
  kind: "registration",
  title: "Test",
  status: "open",
  event_path: "docs/company/events/2026-06/EVT-20260626-registration-mal-shogo.md",
  artifact_dir: "docs/company/artifacts/2026-06/EVT-20260626-registration-mal-shogo/",
  created_at: "2026-06-26",
};

const validMd = `---
event_id: EVT-20260626-registration-mal-shogo
occurred_at: 2026-06-26
kind: registration
status: open
artifact_dir: docs/company/artifacts/2026-06/EVT-20260626-registration-mal-shogo/
---

# Test

## 概要

（イベントの目的・結果を記載）

## 経緯

- 2026-06-26: イベント記録を作成

## 関連 ID

- （なし）

## 出力書類

- 索引: \`docs/company/artifacts/2026-06/EVT-20260626-registration-mal-shogo/00-artifact-index.md\`
`;

describe("company event markdown lint", () => {
  it("passes canonical template", () => {
    const issues = lintCompanyEventMarkdown(event, validMd);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("flags missing frontmatter", () => {
    const issues = lintCompanyEventMarkdown(event, "# no frontmatter\n");
    expect(issues.some((i) => i.code === "event-md-frontmatter-missing")).toBe(true);
  });

  it("flags missing required sections", () => {
    const issues = lintCompanyEventMarkdown(event, `---\nevent_id: ${event.id}\n---\n\n# x\n`);
    expect(issues.some((i) => i.code === "event-md-section-missing")).toBe(true);
  });
});
