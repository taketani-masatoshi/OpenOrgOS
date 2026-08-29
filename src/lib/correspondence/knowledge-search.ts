/**
 * Deterministic L0–L1 knowledge search for correspondence compose.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getDocsDir, getDataDir } from "../utils.js";
import { loadSalesQuotes } from "../data.js";
import { handleContractStatusChatMessage } from "../steward-chat/contract-status-intent.js";

export interface KnowledgeHit {
  path: string;
  title: string;
  excerpt: string;
  score: number;
}

const ALLOWLIST_PREFIXES = [
  "docs/product/",
  "docs/sales/",
  "data/sales/quotes.yaml",
  "data/contracts/",
] as const;

function isAllowlisted(logicalPath: string): boolean {
  const norm = logicalPath.replace(/^\.\//, "");
  return ALLOWLIST_PREFIXES.some((p) => norm === p || norm.startsWith(p));
}

function scoreText(text: string, queryTerms: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (lower.includes(term.toLowerCase())) score += 1;
  }
  return score;
}

function excerptAroundMatch(text: string, queryTerms: string[], maxLen = 240): string {
  const lower = text.toLowerCase();
  for (const term of queryTerms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 80);
      return text.slice(start, start + maxLen).replace(/\s+/g, " ").trim();
    }
  }
  return text.slice(0, maxLen).replace(/\s+/g, " ").trim();
}

function searchFile(absPath: string, logicalPath: string, queryTerms: string[]): KnowledgeHit | undefined {
  if (!isAllowlisted(logicalPath)) return undefined;
  if (!existsSync(absPath)) return undefined;
  const text = readFileSync(absPath, "utf-8");
  const score = scoreText(text, queryTerms);
  if (score <= 0) return undefined;
  const title = logicalPath.split("/").pop() ?? logicalPath;
  return {
    path: logicalPath,
    title,
    excerpt: excerptAroundMatch(text, queryTerms),
    score,
  };
}

function walkMarkdown(
  dir: string,
  baseLogical: string,
  queryTerms: string[],
  out: KnowledgeHit[],
  depth = 0,
): void {
  if (!existsSync(dir) || depth > 4) return;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const abs = join(dir, name);
    const logical = `${baseLogical}/${name}`;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkMarkdown(abs, logical, queryTerms, out, depth + 1);
      continue;
    }
    if (!name.endsWith(".md") && !name.endsWith(".yaml") && !name.endsWith(".yml")) continue;
    if (!isAllowlisted(logical)) continue;
    const hit = searchFile(abs, logical, queryTerms);
    if (hit) out.push(hit);
  }
}

function addStructuredQuoteHits(queryTerms: string[], out: KnowledgeHit[]): void {
  const quotes = loadSalesQuotes()?.quotes ?? [];
  for (const q of quotes) {
    const blob = [
      q.id,
      q.deal_id,
      q.status,
      q.amount_band ?? "",
      q.amount_man != null ? String(q.amount_man) : "",
      q.notes ?? "",
      q.doc_ref ?? "",
    ].join(" ");
    const score = scoreText(blob, queryTerms);
    if (score <= 0 && !queryTerms.some((t) => /見積|quote|価格|円/i.test(t))) continue;
    const boosted =
      score ||
      (queryTerms.some((t) => /見積|quote|価格/i.test(t)) && q.status === "accepted" ? 1 : 0);
    if (!boosted) continue;
    out.push({
      path: q.doc_ref?.startsWith("docs/")
        ? q.doc_ref
        : `data/sales/quotes.yaml#${q.id}`,
      title: q.id,
      excerpt: [
        `status=${q.status}`,
        q.amount_band ? `band=${q.amount_band}` : "",
        q.amount_man != null ? `amount_man=${q.amount_man}` : "",
        q.notes ? `notes=${q.notes.slice(0, 120)}` : "",
      ]
        .filter(Boolean)
        .join("; "),
      score: boosted + (q.status === "accepted" ? 2 : 0),
    });
  }
}

function addContractPortfolioHit(queryTerms: string[], out: KnowledgeHit[]): void {
  if (!queryTerms.some((t) => /契約|contract|portfolio|本数/i.test(t))) return;
  try {
    const result = handleContractStatusChatMessage("契約本数を教えて");
    if (!result.handled || !result.view) return;
    out.push({
      path: "data/contracts/",
      title: "契約ポートフォリオ",
      excerpt: `total=${result.view.total};executed=${result.view.by_status.executed}`,
      score: 3,
    });
  } catch {
    /* optional */
  }
}

export function searchCorrespondenceKnowledge(query: string, opts?: { limit?: number }): KnowledgeHit[] {
  const terms = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (!terms.length) return [];

  const hits: KnowledgeHit[] = [];
  walkMarkdown(join(getDocsDir(), "product"), "docs/product", terms, hits);
  walkMarkdown(join(getDocsDir(), "sales"), "docs/sales", terms, hits);

  const quotesPath = join(getDataDir(), "sales", "quotes.yaml");
  const quotesLogical = "data/sales/quotes.yaml";
  const qHit = searchFile(quotesPath, quotesLogical, terms);
  if (qHit) hits.push(qHit);

  addStructuredQuoteHits(terms, hits);
  addContractPortfolioHit(terms, hits);

  const seen = new Set<string>();
  return hits
    .sort((a, b) => b.score - a.score)
    .filter((h) => {
      const key = `${h.path}::${h.excerpt.slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, opts?.limit ?? 8);
}

export function isAttachmentPathAllowlisted(logicalPath: string): boolean {
  const norm = logicalPath.replace(/^\.\//, "").replace(/\\/g, "/");
  if (norm.includes("records/") || norm.includes("vault")) return false;
  if (norm.startsWith("docs/sales/quotes/")) return true;
  if (norm.startsWith("docs/product/")) return true;
  if (norm.startsWith("docs/sales/")) return true;
  return false;
}

export function resolveTenantLogicalPath(logicalPath: string): string | undefined {
  const norm = logicalPath.replace(/^\.\//, "").replace(/\\/g, "/");
  if (norm.startsWith("docs/")) {
    const abs = join(getDocsDir(), norm.slice("docs/".length));
    return existsSync(abs) ? abs : undefined;
  }
  if (norm.startsWith("data/")) {
    const abs = join(getDataDir(), norm.slice("data/".length));
    return existsSync(abs) ? abs : undefined;
  }
  return undefined;
}
