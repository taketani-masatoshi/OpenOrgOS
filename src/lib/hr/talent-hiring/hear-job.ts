import {
  jobHearingAnswersSchema,
  jobPostingSchema,
  type JobHearingQuestion,
  type JobHearingQuestionField,
  type JobHearingResult,
  type JobPosting,
} from "../../../../schemas/talent-hiring.js";

const QUESTIONS: JobHearingQuestion[] = [
  { field: "work_summary", prompt: "何をする仕事ですか。" },
  { field: "starts_on", prompt: "開始日はいつですか。YYYY-MM-DD で答えてください。" },
  { field: "duration_days", prompt: "何日ですか。" },
  { field: "headcount", prompt: "何名ですか。" },
  { field: "pay", prompt: "時給上限と通貨は何ですか。" },
];

const RESTRICTED_WORK = [
  /\d+\s*歳/,
  /\d+\s*代/,
  /女性のみ|男性のみ|女性限定|男性限定|女性希望|男性希望/,
];

const PRACTICAL_CHECKS = [
  "説明のあと、手順を一人で1サイクル完了できる",
  "指示者の年齢や役職に関係なく、担当者の指示どおりに動ける",
  "作業中の手順変更1つに合わせられる",
  "わからないことと異常をその場で報告できる",
  "指定の服装で、髪・爪・装飾が作業の妨げにならない",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function question(field: JobHearingQuestionField): JobHearingQuestion {
  const found = QUESTIONS.find((item) => item.field === field);
  if (!found) throw new Error(`unknown hearing field: ${field}`);
  return found;
}

function missingQuestions(answers: Record<string, unknown>): JobHearingQuestion[] {
  const parsed = jobHearingAnswersSchema.safeParse(answers);
  const value = parsed.success ? parsed.data : {};
  const fields: JobHearingQuestionField[] = [];
  if (!value.work_summary) fields.push("work_summary");
  if (!value.starts_on) fields.push("starts_on");
  if (!value.duration_days) fields.push("duration_days");
  if (!value.headcount) fields.push("headcount");
  if (!value.max_hourly_rate || !value.currency) fields.push("pay");
  return fields.map(question);
}

function postingBody(posting: Omit<JobPosting, "body">): string {
  const checks = posting.checks.map((check) => `- ${check}`).join("\n");
  return [
    `# ${posting.title}`,
    "",
    posting.duties,
    "",
    `- 開始日: ${posting.starts_on}`,
    `- 期間: ${posting.duration_days}日`,
    `- 人数: ${posting.headcount}名`,
    `- 時給上限: ${posting.max_hourly_rate} ${posting.currency}`,
    "",
    "## 確認すること",
    "短い実演で見ます。自己申告では判断しません。",
    "",
    checks,
    "",
    "年齢・性別では選考しない。",
  ].join("\n");
}

export function hearJobRequest(answers: unknown): JobHearingResult {
  if (!isRecord(answers)) {
    return { status: "need_answers", questions: QUESTIONS };
  }
  const parsed = jobHearingAnswersSchema.safeParse(answers);
  if (!parsed.success) {
    const unknown = parsed.error.issues.some((issue) => issue.code === "unrecognized_keys");
    if (unknown) {
      return { status: "rejected", reason: "年齢・性別・生年月日では条件を書けません。" };
    }
  }
  const work = typeof answers.work_summary === "string" ? answers.work_summary : "";
  if (RESTRICTED_WORK.some((pattern) => pattern.test(work))) {
    return {
      status: "rejected",
      reason: "年齢や性別では条件を書けません。仕事の動作で書き直してください。",
    };
  }
  const questions = missingQuestions(answers);
  if (questions.length > 0) return { status: "need_answers", questions };
  if (
    !parsed.success ||
    !parsed.data.work_summary ||
    !parsed.data.starts_on ||
    parsed.data.duration_days === undefined ||
    parsed.data.headcount === undefined ||
    parsed.data.max_hourly_rate === undefined ||
    !parsed.data.currency
  ) {
    return { status: "need_answers", questions: QUESTIONS };
  }
  const draft = {
    title: parsed.data.work_summary,
    starts_on: parsed.data.starts_on,
    duration_days: parsed.data.duration_days,
    headcount: parsed.data.headcount,
    max_hourly_rate: parsed.data.max_hourly_rate,
    currency: parsed.data.currency,
    duties: parsed.data.work_summary,
    checks: [...PRACTICAL_CHECKS],
  };
  const posting = jobPostingSchema.parse({
    ...draft,
    body: postingBody(draft),
  });
  return { status: "ready", posting };
}
