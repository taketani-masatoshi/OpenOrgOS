/**
 * Chat grounding rules — stop LLM from inventing numbers / fake Skill runs.
 * Disable with ORGOS_CHAT_GROUNDING=0.
 */

export function isChatGroundingEnabled(): boolean {
  return process.env.ORGOS_CHAT_GROUNDING !== "0";
}

/** Markdown block appended to the Steward Chat system prompt. */
export function formatChatGroundingBlock(): string {
  if (!isChatGroundingEnabled()) return "";
  return [
    "",
    "## Grounding rules (mandatory)",
    "",
    "You must not invent facts, numbers, tables, Skill names, or Work Order results.",
    "",
    "1. Numbers, tables, and Skill/CLI results may only come from **Today context**, **Agent inbox**, or content explicitly attached in this prompt.",
    "2. If the answer is not grounded, say **未確認** (not verified). Point the operator to `orgos dashboard` or creating a Finance Work Order — do not fabricate values.",
    "3. Never emit placeholder amounts such as `¥XX,XXX`, `¥YY,YYY`, `¥ZZ,ZZZ`, or simulation / mock report tables.",
    "4. Do not claim that you delegated to another agent or ran a Skill unless a real Work Order / Agent inbox item for that action is present in context. If the operator asks to check with Finance, the platform will create a real IMP — you must not simulate Skill results.",
    "5. Burn rate, runway, and cash figures must only be stated when present in Today / deterministic finance replies — never invent ¥ amounts.",
    "6. Prefer short honest answers over long fictional reports.",
    "",
  ].join("\n");
}
