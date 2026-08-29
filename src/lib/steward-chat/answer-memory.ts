/**
 * Derived answer-memory index for Steward Chat.
 * Canonical Q/A stays in chat/threads/*.json; this file is rebuildable.
 * Disable with ORGOS_CHAT_ANSWER_MEMORY=0.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { tenantDataPath } from "../tenant.js";
import {
  agentIdFromThreadId,
  type ChatAnswerSource,
  type ChatThread,
  type ChatTurnMeta,
  DEFAULT_ANSWER_MEMORY_SETTINGS,
  getAnswerMemorySettings,
  listChatThreadIds,
  loadChatThread,
  type AnswerMemorySettings,
} from "./chat-thread.js";

export const ANSWER_MEMORY_MAX_CHARS = 2000;

const SOURCE_RANK: Record<ChatAnswerSource, number> = {
  cloud: 3,
  local: 2,
  faq: 2,
  unknown: 1,
  deterministic: 0,
};

const entrySchema = z.object({
  id: z.string(),
  agent_id: z.string().optional(),
  query_norm: z.string(),
  query_hash: z.string(),
  answer: z.string(),
  answer_hash: z.string().optional(),
  at: z.string(),
  source: z.enum(["cloud", "local", "deterministic", "unknown", "faq"]),
  model: z.string().optional(),
  worker_id: z.string().optional(),
  good_count: z.number().int().nonnegative().default(0),
  bad_count: z.number().int().nonnegative().default(0),
  suppressed: z.boolean().optional(),
});

const indexSchema = z.object({
  version: z.literal(1),
  updated_at: z.string(),
  entries: z.array(entrySchema),
});

export type AnswerMemoryEntry = z.output<typeof entrySchema>;
export type AnswerMemoryIndex = z.output<typeof indexSchema>;

export interface AnswerMemoryHit {
  entry: AnswerMemoryEntry;
  score: number;
  exact: boolean;
}

export function isAnswerMemoryEnabled(settings?: AnswerMemorySettings): boolean {
  if (process.env.ORGOS_CHAT_ANSWER_MEMORY === "0") return false;
  return (settings ?? getAnswerMemorySettings()).enabled;
}

function memoryRoot(): string {
  const dir = join(tenantDataPath("chat"), "answer-memory");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function indexPath(): string {
  return join(memoryRoot(), "index.json");
}

export function normalizeQuery(query: string): string {
  return query.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function queryHash(query: string): string {
  return createHash("sha256").update(normalizeQuery(query)).digest("hex").slice(0, 24);
}

export function answerHash(answer: string): string {
  return createHash("sha256").update(answer.trim()).digest("hex").slice(0, 24);
}

export function feedbackNetScore(entry: AnswerMemoryEntry): number {
  return (entry.good_count ?? 0) - (entry.bad_count ?? 0);
}

export function isEntryRetrievable(entry: AnswerMemoryEntry): boolean {
  if (entry.suppressed) return false;
  if ((entry.bad_count ?? 0) > (entry.good_count ?? 0)) return false;
  return true;
}

export function tokenizeQuery(query: string): string[] {
  const n = normalizeQuery(query);
  const tokens = new Set<string>();
  for (const m of n.match(/[a-z0-9ぁ-んァ-ン一-龥]+/gi) ?? []) {
    const t = m.toLowerCase();
    if (t.length >= 2) tokens.add(t);
  }
  // CJK character unigrams + bigrams for short Japanese queries
  const cjkRuns = n.replace(/[a-z0-9\s]+/gi, " ").trim();
  for (const run of cjkRuns.split(/\s+/)) {
    if (!run) continue;
    for (let i = 0; i < run.length; i++) {
      tokens.add(run[i]!);
      if (i + 1 < run.length) tokens.add(run.slice(i, i + 2));
    }
  }
  return [...tokens];
}

export function jaccardScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function clipAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (trimmed.length <= ANSWER_MEMORY_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, ANSWER_MEMORY_MAX_CHARS)}\n…(truncated)`;
}

function entryKey(agentId: string | undefined, hash: string): string {
  return createHash("sha256")
    .update(`${agentId ?? ""}:${hash}`)
    .digest("hex")
    .slice(0, 16);
}

function isIndexableSource(source: ChatAnswerSource): boolean {
  return source === "cloud" || source === "local" || source === "unknown" || source === "faq";
}

export function chatMetaFromLlmResult(result: {
  runtime: string;
  model?: string;
  tier?: "local" | "cloud";
  worker_id?: string;
}): ChatTurnMeta {
  if (result.runtime !== "llm-api") {
    return { source: "unknown", model: result.model, worker_id: result.worker_id };
  }
  if (result.tier === "cloud") {
    return { source: "cloud", model: result.model, worker_id: result.worker_id };
  }
  if (result.tier === "local") {
    return { source: "local", model: result.model, worker_id: result.worker_id };
  }
  return { source: "unknown", model: result.model, worker_id: result.worker_id };
}

export function loadAnswerMemoryIndex(): AnswerMemoryIndex {
  const path = indexPath();
  if (!existsSync(path)) {
    return { version: 1, updated_at: new Date().toISOString(), entries: [] };
  }
  try {
    return indexSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return { version: 1, updated_at: new Date().toISOString(), entries: [] };
  }
}

function saveAnswerMemoryIndex(index: AnswerMemoryIndex): AnswerMemoryIndex {
  const next = indexSchema.parse({
    ...index,
    updated_at: new Date().toISOString(),
  });
  const path = indexPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

function preferEntry(a: AnswerMemoryEntry, b: AnswerMemoryEntry): AnswerMemoryEntry {
  if (a.suppressed && !b.suppressed) return b;
  if (b.suppressed && !a.suppressed) return a;
  const netA = feedbackNetScore(a);
  const netB = feedbackNetScore(b);
  if (netA !== netB) return netA > netB ? a : b;
  const rankA = SOURCE_RANK[a.source];
  const rankB = SOURCE_RANK[b.source];
  if (rankA !== rankB) return rankA > rankB ? a : b;
  return a.at >= b.at ? a : b;
}

function mergeMemoryEntry(existing: AnswerMemoryEntry, incoming: AnswerMemoryEntry): AnswerMemoryEntry {
  const sameAnswer = existing.answer_hash && incoming.answer_hash && existing.answer_hash === incoming.answer_hash;
  const base = preferEntry(existing, incoming);
  if (sameAnswer) {
    return {
      ...base,
      good_count: Math.max(existing.good_count ?? 0, incoming.good_count ?? 0),
      bad_count: Math.max(existing.bad_count ?? 0, incoming.bad_count ?? 0),
      suppressed: (existing.bad_count ?? 0) > (existing.good_count ?? 0) || (incoming.bad_count ?? 0) > (incoming.good_count ?? 0),
    };
  }
  return {
    ...base,
    good_count: incoming.good_count ?? 0,
    bad_count: incoming.bad_count ?? 0,
    suppressed: incoming.suppressed,
  };
}

function upsertEntry(index: AnswerMemoryIndex, entry: AnswerMemoryEntry): AnswerMemoryIndex {
  const existingIdx = index.entries.findIndex((e) => e.id === entry.id);
  if (existingIdx < 0) {
    return { ...index, entries: [...index.entries, entry] };
  }
  const existing = index.entries[existingIdx]!;
  const kept = mergeMemoryEntry(existing, entry);
  const entries = [...index.entries];
  entries[existingIdx] = kept;
  return { ...index, entries };
}

export function rememberAnswer(opts: {
  query: string;
  answer: string;
  agentId?: string;
  source: ChatAnswerSource;
  model?: string;
  worker_id?: string;
  at?: string;
}): AnswerMemoryEntry | null {
  if (!isAnswerMemoryEnabled()) return null;
  if (!isIndexableSource(opts.source)) return null;
  const query_norm = normalizeQuery(opts.query);
  if (!query_norm || !opts.answer.trim()) return null;
  const query_hash = queryHash(opts.query);
  const entry: AnswerMemoryEntry = {
    id: entryKey(opts.agentId, query_hash),
    agent_id: opts.agentId,
    query_norm,
    query_hash,
    answer: clipAnswer(opts.answer),
    answer_hash: answerHash(opts.answer),
    at: opts.at ?? new Date().toISOString(),
    source: opts.source,
    model: opts.model,
    worker_id: opts.worker_id,
    good_count: 0,
    bad_count: 0,
  };
  const index = upsertEntry(loadAnswerMemoryIndex(), entry);
  saveAnswerMemoryIndex(index);
  return entry;
}

export function applyAnswerFeedback(opts: {
  query: string;
  answer: string;
  agentId?: string;
  rating: "good" | "bad";
}): AnswerMemoryEntry | null {
  if (!isAnswerMemoryEnabled()) return null;
  const query_norm = normalizeQuery(opts.query);
  if (!query_norm || !opts.answer.trim()) return null;
  const query_hash = queryHash(opts.query);
  const id = entryKey(opts.agentId, query_hash);
  const index = loadAnswerMemoryIndex();
  const existingIdx = index.entries.findIndex((e) => e.id === id);
  const aHash = answerHash(opts.answer);
  const now = new Date().toISOString();

  let entry: AnswerMemoryEntry;
  if (existingIdx >= 0) {
    const existing = index.entries[existingIdx]!;
    const good = (existing.good_count ?? 0) + (opts.rating === "good" ? 1 : 0);
    const bad = (existing.bad_count ?? 0) + (opts.rating === "bad" ? 1 : 0);
    const suppressed = bad > good || (opts.rating === "bad" && existing.answer_hash === aHash);
    entry = {
      ...existing,
      answer: clipAnswer(opts.answer),
      answer_hash: aHash,
      good_count: good,
      bad_count: bad,
      suppressed,
      at: now,
    };
    const entries = [...index.entries];
    entries[existingIdx] = entry;
    saveAnswerMemoryIndex({ ...index, entries });
  } else if (opts.rating === "good") {
    entry = {
      id,
      agent_id: opts.agentId,
      query_norm,
      query_hash,
      answer: clipAnswer(opts.answer),
      answer_hash: aHash,
      at: now,
      source: "unknown",
      good_count: 1,
      bad_count: 0,
    };
    saveAnswerMemoryIndex(upsertEntry(index, entry));
  } else {
    entry = {
      id,
      agent_id: opts.agentId,
      query_norm,
      query_hash,
      answer: clipAnswer(opts.answer),
      answer_hash: aHash,
      at: now,
      source: "unknown",
      good_count: 0,
      bad_count: 1,
      suppressed: true,
    };
    saveAnswerMemoryIndex(upsertEntry(index, entry));
  }
  return entry;
}

function isExpired(entry: AnswerMemoryEntry, ttlDays: number, nowMs: number): boolean {
  const atMs = Date.parse(entry.at);
  if (!Number.isFinite(atMs)) return true;
  return nowMs - atMs > ttlDays * 24 * 60 * 60 * 1000;
}

export function retrieveAnswerMemory(
  query: string,
  opts?: {
    agentId?: string;
    /** Normalized query hashes already present in the live thread (skip duplicates). */
    excludeQueryHashes?: Set<string>;
    settings?: AnswerMemorySettings;
    now?: Date;
  }
): AnswerMemoryHit[] {
  const settings = opts?.settings ?? getAnswerMemorySettings();
  if (!isAnswerMemoryEnabled(settings)) return [];
  const qNorm = normalizeQuery(query);
  if (!qNorm) return [];
  const qHash = queryHash(query);
  const qTokens = tokenizeQuery(query);
  const nowMs = (opts?.now ?? new Date()).getTime();
  const index = loadAnswerMemoryIndex();
  const hits: AnswerMemoryHit[] = [];

  for (const entry of index.entries) {
    if (opts?.agentId && entry.agent_id && entry.agent_id !== opts.agentId) continue;
    if (opts?.excludeQueryHashes?.has(entry.query_hash)) continue;
    if (isExpired(entry, settings.ttl_days, nowMs)) continue;
    if (!isEntryRetrievable(entry)) continue;

    let score = 0;
    let exact = false;
    if (entry.query_hash === qHash) {
      score = 1;
      exact = true;
    } else {
      score = jaccardScore(qTokens, tokenizeQuery(entry.query_norm));
    }
    if (entry.source === "cloud") score += 0.12;
    else if (entry.source === "local") score += 0.04;
    const net = feedbackNetScore(entry);
    if (net > 0) score += Math.min(0.25, net * 0.08);
    if (net < 0) continue;

    if (score < settings.min_score && !exact) continue;
    hits.push({ entry, score, exact });
  }

  hits.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return SOURCE_RANK[b.entry.source] - SOURCE_RANK[a.entry.source];
  });

  return hits.slice(0, settings.max_hits);
}

export function recentUserQueryHashes(thread: ChatThread, limit = 20): Set<string> {
  const hashes = new Set<string>();
  // Only paired turns — the just-appended unpaired user message must not block memory hits.
  const paired: string[] = [];
  const messages = thread.messages;
  for (let i = 0; i < messages.length - 1; i++) {
    const user = messages[i];
    const assistant = messages[i + 1];
    if (user?.role === "user" && assistant?.role === "assistant") {
      paired.push(user.content);
    }
  }
  for (const content of paired.slice(-limit)) hashes.add(queryHash(content));
  return hashes;
}

/** Rebuild derived index from all on-disk threads (skips deterministic). */
export function reindexAnswerMemory(tenant: string): {
  threads: number;
  pairs: number;
  indexed: number;
} {
  let pairs = 0;
  let indexed = 0;
  const ids = listChatThreadIds();
  let index: AnswerMemoryIndex = {
    version: 1,
    updated_at: new Date().toISOString(),
    entries: [],
  };

  for (const threadId of ids) {
    let thread: ChatThread;
    try {
      thread = loadChatThread(threadId, tenant);
    } catch {
      continue;
    }
    const agentId = agentIdFromThreadId(threadId);
    const messages = thread.messages;
    for (let i = 0; i < messages.length - 1; i++) {
      const user = messages[i];
      const assistant = messages[i + 1];
      if (user?.role !== "user" || assistant?.role !== "assistant") continue;
      pairs += 1;
      const source: ChatAnswerSource = assistant.source ?? "unknown";
      if (!isIndexableSource(source)) continue;
      const query_norm = normalizeQuery(user.content);
      if (!query_norm || !assistant.content.trim()) continue;
      const query_hash = queryHash(user.content);
      const entry: AnswerMemoryEntry = {
        id: entryKey(agentId, query_hash),
        agent_id: agentId,
        query_norm,
        query_hash,
        answer: clipAnswer(assistant.content),
        answer_hash: answerHash(assistant.content),
        at: assistant.at,
        source,
        model: assistant.model,
        worker_id: assistant.worker_id,
        good_count: assistant.feedback === "good" ? 1 : 0,
        bad_count: assistant.feedback === "bad" ? 1 : 0,
        suppressed: assistant.feedback === "bad",
      };
      index = upsertEntry(index, entry);
      indexed += 1;
    }
  }

  saveAnswerMemoryIndex(index);
  return { threads: ids.length, pairs, indexed: index.entries.length };
}

/** Markdown block for system prompt (empty when no hits / disabled). */
export function formatAnswerMemoryBlock(hits: AnswerMemoryHit[]): string {
  if (!hits.length) return "";
  const lines = [
    "",
    "## Prior cloud/local answers (reference only)",
    "",
    "These are past Steward Chat replies (often from a more precise cloud model).",
    "They are **reference phrasing / procedure**, not live facts.",
    "- If **Today context**, Fact providers, or inbox contradict them, **Today wins** — never copy stale numbers.",
    "- If they still match and nothing is outdated, reply with the **same short conclusion** (do not invent a longer report).",
    "- If unsure, say **未確認**.",
    "",
  ];
  hits.forEach((hit, i) => {
    lines.push(`### Reference ${i + 1} (${hit.entry.source}${hit.exact ? ", exact" : `, score ${hit.score.toFixed(2)}`})`);
    lines.push(`Q: ${hit.entry.query_norm}`);
    lines.push(`A: ${hit.entry.answer}`);
    lines.push("");
  });
  return lines.join("\n");
}

/** Convenience: settings defaults for tests without disk. */
export function answerMemoryDefaults(): AnswerMemorySettings {
  return { ...DEFAULT_ANSWER_MEMORY_SETTINGS };
}
