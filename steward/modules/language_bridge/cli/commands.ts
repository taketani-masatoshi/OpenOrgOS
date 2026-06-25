import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildDocumentFrontmatter,
  buildMinutesDraftMarkdown,
  formatLanguageBridgeReport,
  minutesDraftPath,
  resolveLanguageBridge,
  validateLanguageBridge,
} from "./lib.js";

export function runLanguageBridgeShow(opts: { json?: boolean }): void {
  const resolved = resolveLanguageBridge();
  if (opts.json) {
    console.log(JSON.stringify(resolved, null, 2));
    return;
  }
  console.log(formatLanguageBridgeReport(resolved));
}

export function runLanguageBridgeValidate(): void {
  const issues = validateLanguageBridge();
  if (issues.length === 0) {
    console.log("✓ language_bridge — config OK");
    return;
  }
  console.error("✗ language_bridge validation:");
  for (const issue of issues) {
    console.error(`  - ${issue}`);
  }
  process.exit(1);
}

export function runLanguageBridgeHeader(opts: { doc: string }): void {
  console.log(buildDocumentFrontmatter(opts.doc));
}

export interface LanguageBridgeDraftOpts {
  type: string;
  title: string;
  date?: string;
  slug?: string;
  write?: boolean;
}

export function runLanguageBridgeDraft(opts: LanguageBridgeDraftOpts): void {
  const content = buildMinutesDraftMarkdown({
    docType: opts.type,
    title: opts.title,
    date: opts.date,
  });
  const path = minutesDraftPath(opts.slug ?? opts.title, opts.date);

  console.log(content);

  if (opts.write) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf-8");
    console.error(`\n✓ draft: ${path}`);
  } else {
    console.error(`\n(dry-run · --write で ${path} に保存)`);
  }
}
