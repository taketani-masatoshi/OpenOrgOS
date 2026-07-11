import { loadMailConfig } from "./mail-config.js";

/** カテゴリ値の多数決（同数なら unclear / 先頭フォールバック） */
export function majorityVote<T extends string>(
  values: T[],
  fallback: T
): { winner: T; agreement: number; dissent: T[] } {
  if (!values.length) return { winner: fallback, agreement: 0, dissent: [] };
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let winner = fallback;
  let max = 0;
  for (const [k, c] of counts) {
    if (c > max) {
      max = c;
      winner = k;
    }
  }
  const agreement = max / values.length;
  const dissent = [...counts.keys()].filter((k) => k !== winner);
  return { winner, agreement, dissent };
}

export function majorityVoteBoolean(values: boolean[]): {
  winner: boolean;
  agreement: number;
} {
  if (!values.length) return { winner: false, agreement: 0 };
  const trueCount = values.filter(Boolean).length;
  const falseCount = values.length - trueCount;
  if (trueCount === falseCount) return { winner: false, agreement: 0.5 };
  const winner = trueCount > falseCount;
  return { winner, agreement: Math.max(trueCount, falseCount) / values.length };
}

/** 要約は最頻出 intent に紐づく最長共通プレフィックスではなく、最多票の最初の vote の summary を採用 */
export function pickSummaryFromVotes<T extends { summary_l1: string }>(
  votes: T[],
  pickIndex: number
): string {
  return votes[pickIndex]?.summary_l1 ?? votes[0]?.summary_l1 ?? "";
}

export function isCeoInlineQuestionMode(): boolean {
  if (process.env.ORGOS_MAIL_CEO_QUESTION_MODE === "consult") return false;
  if (process.env.ORGOS_MAIL_CEO_QUESTION_MODE === "inline") return true;
  try {
    const cfg = loadMailConfig();
    return cfg?.receive?.ceo_question_mode !== "consult";
  } catch {
    return true;
  }
}

export function parseInterpretModelsFromEnv(): string[] {
  try {
    const cfg = loadMailConfig();
    const fromYaml = cfg?.receive?.interpret_models?.filter(Boolean);
    if (fromYaml?.length) return fromYaml.slice(0, 5);
  } catch {
    /* ignore */
  }
  const raw =
    process.env.ORGOS_MAIL_INTERPRET_MODELS?.trim() ||
    process.env.ORGOS_LLM_MODEL?.trim() ||
    "";
  if (!raw) return ["gpt-4o-mini"];
  const models = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return models.length ? models.slice(0, 5) : ["gpt-4o-mini"];
}

export function isMailInterpretEnsembleEnabled(): boolean {
  if (process.env.ORGOS_MAIL_INTERPRET_ENSEMBLE === "0") return false;
  if (process.env.ORGOS_MAIL_INTERPRET_ENSEMBLE === "1") return true;
  try {
    const cfg = loadMailConfig();
    return cfg?.receive?.interpret_ensemble !== false;
  } catch {
    return true;
  }
}
