/**
 * Chat grounding rules — stop LLM from inventing numbers / fake Skill runs.
 * Deterministic domain list is generated from FactProviderRegistry.
 * Disable with ORGOS_CHAT_GROUNDING=0.
 */
import { formatFactGroundingLines } from "../operator-facts/registry.js";

export function isChatGroundingEnabled(): boolean {
  return process.env.ORGOS_CHAT_GROUNDING !== "0";
}

/** Markdown block appended to the Steward Chat system prompt. */
export function formatChatGroundingBlock(): string {
  if (!isChatGroundingEnabled()) return "";
  const factLines = formatFactGroundingLines();
  return [
    "",
    "## Grounding rules (mandatory)",
    "",
    "You must not invent facts, numbers, tables, Skill names, or Work Order results.",
    "",
    "1. Numbers, tables, and Skill/CLI results may only come from **Today context**, **Agent inbox**, or content explicitly attached in this prompt.",
    "2. The platform answers the following domains **deterministically before you run** — do **not** write refusal essays, invent CLI commands, or tell the operator to @ another agent for these:",
    ...factLines.map((l) => `   ${l}`),
    "3. If somehow you still see such a question, reply only that the deterministic path should answer it — never invent amounts or headcounts.",
    "4. Detail / body content (e.g. contract clauses) still belongs to the owner Agent via a **real Work Order**（「Contract に確認して」 / 「人事に確認して」）.",
    "5. If another fact is not grounded, say **未確認**. Prefer `orgos dashboard` / `orgos hr headcount` (not invented Skill names). Do not fabricate values.",
    "6. Never emit placeholder amounts such as `¥XX,XXX`, `¥YY,YYY`, `¥ZZ,ZZZ`, `XX名`, `N名`, or simulation / mock report tables. Never write meta text like 「ここに集計値が入ります」.",
    "7. Do not claim that you delegated to another agent or ran a Skill unless a real Work Order / Agent inbox item for that action is present in context. If the operator asks to check with Finance / Contract / Compliance / Operations / HR, the platform will create a real IMP — you must not simulate Skill results.",
    "8. Executive Steward policy forbids *ad-hoc* `data/**/*.yaml` reading in free chat — but **dashboard KPIs and fact-provider replies in Today / deterministic paths are in-scope**. Do not pretend burn rate, contract counts, or headcount are inaccessible when the platform lists them.",
    "9. Prefer short honest answers over long fictional reports. Follow **CEO reply style** — no role-play preambles, no system-architecture lectures.",
    "",
  ].join("\n");
}
