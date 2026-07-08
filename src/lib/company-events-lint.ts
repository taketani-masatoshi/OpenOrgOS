import { readFileSync } from "node:fs";
import type { CompanyEvent } from "../../schemas/company-events.js";

const REQUIRED_EVENT_SECTIONS = ["概要", "経緯", "関連 ID", "出力書類"] as const;

const FRONTMATTER_KEYS = ["event_id", "occurred_at", "kind", "status", "artifact_dir"] as const;

export interface CompanyEventMarkdownLintIssue {
  code: string;
  message: string;
  event_id?: string;
  severity: "error" | "warning";
}

function parseFrontmatter(content: string): Record<string, string> | null {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---\n", 4);
  if (end < 0) return null;
  const block = content.slice(4, end);
  const data: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return data;
}

function hasSection(content: string, heading: string): boolean {
  return new RegExp(`^## ${heading}\\s*$`, "m").test(content);
}

export function lintCompanyEventMarkdown(
  event: CompanyEvent,
  content: string
): CompanyEventMarkdownLintIssue[] {
  const issues: CompanyEventMarkdownLintIssue[] = [];
  const fm = parseFrontmatter(content);

  if (!fm) {
    issues.push({
      code: "event-md-frontmatter-missing",
      message: "Missing YAML frontmatter block",
      event_id: event.id,
      severity: "error",
    });
    return issues;
  }

  for (const key of FRONTMATTER_KEYS) {
    if (!fm[key]) {
      issues.push({
        code: "event-md-frontmatter-field-missing",
        message: `Frontmatter missing ${key}`,
        event_id: event.id,
        severity: "error",
      });
    }
  }

  if (fm.event_id && fm.event_id !== event.id) {
    issues.push({
      code: "event-md-frontmatter-id-mismatch",
      message: `Frontmatter event_id ${fm.event_id} != registry ${event.id}`,
      event_id: event.id,
      severity: "error",
    });
  }

  if (fm.artifact_dir && fm.artifact_dir !== event.artifact_dir) {
    issues.push({
      code: "event-md-artifact-dir-mismatch",
      message: "Frontmatter artifact_dir does not match registry",
      event_id: event.id,
      severity: "warning",
    });
  }

  for (const section of REQUIRED_EVENT_SECTIONS) {
    if (!hasSection(content, section)) {
      issues.push({
        code: "event-md-section-missing",
        message: `Missing required section: ## ${section}`,
        event_id: event.id,
        severity: "warning",
      });
    }
  }

  if (!content.includes(event.artifact_dir)) {
    issues.push({
      code: "event-md-artifact-link-missing",
      message: "Event MD should link artifact_dir path in 出力書類 section",
      event_id: event.id,
      severity: "warning",
    });
  }

  if (/^## 書類全文/m.test(content) || /^## 添付 PDF/m.test(content)) {
    issues.push({
      code: "event-md-document-body-forbidden",
      message: "Do not embed full documents in event MD — use artifacts/",
      event_id: event.id,
      severity: "error",
    });
  }

  return issues;
}
