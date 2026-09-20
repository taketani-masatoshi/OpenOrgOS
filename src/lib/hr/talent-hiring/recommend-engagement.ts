import {
  engagementDiscussAnswersSchema,
  type EngagementDiscussQuestion,
  type EngagementDiscussQuestionField,
  type EngagementDiscussResult,
  type EngagementKind,
  type EngagementOption,
} from "../../../../schemas/talent-hiring.js";

const FORBIDDEN_KEYS = ["age", "gender", "birth_date"] as const;

const QUESTIONS: EngagementDiscussQuestion[] = [
  { field: "company_directs", prompt: "会社が作業のやり方を指揮命令しますか。" },
  { field: "fixed_term_days", prompt: "期間の定めは何日ですか。無い場合は null です。" },
  { field: "deliverable_only", prompt: "成果物の納品だけで、会社が指揮しませんか。" },
];

function question(field: EngagementDiscussQuestionField): EngagementDiscussQuestion {
  const found = QUESTIONS.find((item) => item.field === field);
  if (!found) throw new Error(`unknown discuss field: ${field}`);
  return found;
}

function forbiddenKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return FORBIDDEN_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function option(engagement: EngagementKind, reasons: string[], requires_prerequisites?: boolean): EngagementOption {
  return requires_prerequisites ? { engagement, reasons, requires_prerequisites: true } : { engagement, reasons };
}

export function recommendEngagement(answers: unknown): EngagementDiscussResult {
  const forbidden = forbiddenKeys(answers);
  if (forbidden.length > 0) {
    return { status: "rejected", reason: `年齢・性別では選考しない（${forbidden.join(", ")}）` };
  }

  const parsed = engagementDiscussAnswersSchema.safeParse(answers);
  if (!parsed.success) {
    return { status: "rejected", reason: "契約形態の回答を読めません" };
  }

  const value = parsed.data;
  const missing: EngagementDiscussQuestionField[] = [];
  if (value.company_directs === undefined) missing.push("company_directs");
  if (value.fixed_term_days === undefined) missing.push("fixed_term_days");
  if (value.deliverable_only === undefined) missing.push("deliverable_only");
  if (missing.length > 0) {
    return { status: "need_answers", questions: missing.map(question) };
  }

  const companyDirects = value.company_directs!;
  const fixedTermDays = value.fixed_term_days!;
  const deliverableOnly = value.deliverable_only!;

  const options: EngagementOption[] = [
    option(
      "contractor",
      companyDirects
        ? ["会社が指揮命令する仕事には通常向きません"]
        : ["会社が指揮命令せず、成果物で区切れる"],
      false,
    ),
    option(
      "fixed_term",
      fixedTermDays !== null && companyDirects
        ? [`期間の定めが ${fixedTermDays} 日あり、会社が指揮命令する`]
        : ["期間の定めと指揮命令があるときに使う"],
      false,
    ),
    option(
      "regular",
      ["期間の定めがなく、会社が指揮命令する。署名待ちの前に解雇前提の台帳が必要"],
      true,
    ),
  ];

  let recommended: EngagementKind;
  if (!companyDirects && deliverableOnly) {
    recommended = "contractor";
  } else if (companyDirects && fixedTermDays !== null) {
    recommended = "fixed_term";
  } else if (companyDirects && fixedTermDays === null) {
    recommended = "regular";
  } else {
    recommended = "contractor";
  }

  return { status: "ready", recommended, options };
}
