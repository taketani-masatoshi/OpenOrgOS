/**
 * FAQ index — curated Q→A pairs from Good feedback (and positive net score).
 * Rebuildable; used for fast exact-match replies without LLM.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { tenantDataPath } from "../tenant.js";
import {
  answerHash,
  feedbackNetScore,
  isAnswerMemoryEnabled,
  isEntryRetrievable,
  loadAnswerMemoryIndex,
  normalizeQuery,
  queryHash,
  type AnswerMemoryEntry,
} from "./answer-memory.js";

const faqEntrySchema = z.object({
  id: z.string(),
  agent_id: z.string().optional(),
  query_norm: z.string(),
  query_hash: z.string(),
  answer: z.string(),
  answer_hash: z.string(),
  good_count: z.number().int().nonnegative(),
  bad_count: z.number().int().nonnegative(),
  score: z.number(),
  source: z.enum(["cloud", "local", "deterministic", "unknown", "faq"]),
  at: z.string(),
});

const faqIndexSchema = z.object({
  version: z.literal(1),
  built_at: z.string(),
  entries: z.array(faqEntrySchema),
});

export type FaqEntry = z.output<typeof faqEntrySchema>;
export type FaqIndex = z.output<typeof faqIndexSchema>;

export interface FaqLookupHit {
  entry: FaqEntry;
  exact: boolean;
}

function faqRoot(): string {
  const dir = join(tenantDataPath("chat"), "faq-index");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function faqIndexPath(): string {
  return join(faqRoot(), "index.json");
}

export function loadFaqIndex(): FaqIndex {
  const path = faqIndexPath();
  if (!existsSync(path)) {
    return { version: 1, built_at: new Date(0).toISOString(), entries: [] };
  }
  try {
    return faqIndexSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return { version: 1, built_at: new Date(0).toISOString(), entries: [] };
  }
}

function saveFaqIndex(index: FaqIndex): FaqIndex {
  const next = faqIndexSchema.parse({
    ...index,
    built_at: new Date().toISOString(),
  });
  const path = faqIndexPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

function memoryToFaq(entry: AnswerMemoryEntry): FaqEntry | null {
  const good = entry.good_count ?? 0;
  const bad = entry.bad_count ?? 0;
  if (good <= 0 || bad >= good) return null;
  if (!isEntryRetrievable(entry)) return null;
  const aHash = entry.answer_hash ?? answerHash(entry.answer);
  return {
    id: entry.id,
    agent_id: entry.agent_id,
    query_norm: entry.query_norm,
    query_hash: entry.query_hash,
    answer: entry.answer,
    answer_hash: aHash,
    good_count: good,
    bad_count: bad,
    score: feedbackNetScore(entry) + (entry.source === "cloud" ? 0.5 : 0),
    source: entry.source,
    at: entry.at,
  };
}

/** Rebuild FAQ index from answer-memory (Good-rated, net positive). */
export function buildFaqIndex(): { indexed: number; entries: number } {
  if (!isAnswerMemoryEnabled()) {
    return { indexed: 0, entries: 0 };
  }
  const memory = loadAnswerMemoryIndex();
  const byId = new Map<string, FaqEntry>();
  for (const row of memory.entries) {
    const faq = memoryToFaq(row);
    if (!faq) continue;
    const prev = byId.get(faq.id);
    if (!prev || faq.score > prev.score) byId.set(faq.id, faq);
  }
  const entries = [...byId.values()].sort((a, b) => b.score - a.score);
  saveFaqIndex({ version: 1, built_at: new Date().toISOString(), entries });
  return { indexed: memory.entries.length, entries: entries.length };
}

export function lookupFaq(
  query: string,
  opts?: { agentId?: string; exactOnly?: boolean },
): FaqLookupHit | null {
  const qHash = queryHash(query);
  const index = loadFaqIndex();
  let best: FaqLookupHit | null = null;

  for (const entry of index.entries) {
    if (opts?.agentId && entry.agent_id && entry.agent_id !== opts.agentId) continue;
    if (entry.query_hash === qHash) {
      return { entry, exact: true };
    }
    if (!opts?.exactOnly && !best) {
      const nq = normalizeQuery(query);
      if (entry.query_norm === nq) {
        best = { entry, exact: true };
      }
    }
  }
  return best;
}

/** Exact FAQ hit with positive Good score — safe to return without LLM. */
export function tryServeFaqAnswer(
  query: string,
  opts?: { agentId?: string },
): { answer: string; entry: FaqEntry } | null {
  const hit = lookupFaq(query, { agentId: opts?.agentId, exactOnly: true });
  if (!hit?.exact) return null;
  if (hit.entry.good_count <= hit.entry.bad_count) return null;
  return { answer: hit.entry.answer, entry: hit.entry };
}
