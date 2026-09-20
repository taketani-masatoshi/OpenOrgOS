import {
  platformListingInputSchema,
  type CatalogChoice,
  type MonthlyHoursBand,
  type PlatformListingId,
  type PlatformListingInput,
  type PlatformListingQuestion,
  type PlatformListingResult,
  type PlatformRoleFamily,
} from "../../../../schemas/talent-hiring.js";

const FORBIDDEN_KEYS = ["age", "gender", "birth_date"] as const;

const DIRECTION_TEXT = /指揮命令|毎日指示|出社して指示/;

export const PLATFORM_TARGETS: Record<PlatformListingId, string[]> = {
  workship: ["Workship"],
  fukugyo_cloud: ["複業クラウド"],
  crowdsourcing: ["クラウドワークス", "ランサーズ"],
  it_agent: ["ITプロパートナーズ", "レバテックフリーランス"],
};

const ROLE_FIT: Record<PlatformListingId, readonly PlatformRoleFamily[]> = {
  workship: ["engineer", "designer", "marketer", "editor"],
  fukugyo_cloud: ["engineer", "designer", "marketer", "editor", "other"],
  crowdsourcing: ["engineer", "designer", "marketer", "editor", "other"],
  it_agent: ["engineer"],
};

const HOUR_BANDS: CatalogChoice<MonthlyHoursBand>[] = [
  { id: "40", label: "月40時間前後（閑散）" },
  { id: "96", label: "月96時間前後（通常）" },
  { id: "160", label: "月160時間前後（繁忙）" },
];

const ROLE_OPTIONS: CatalogChoice<PlatformRoleFamily>[] = [
  { id: "engineer", label: "エンジニア", hint: "4媒体すべてに出せる" },
  { id: "designer", label: "デザイナー", hint: "ITエージェント以外" },
  { id: "marketer", label: "マーケ", hint: "ITエージェント以外" },
  { id: "editor", label: "編集", hint: "ITエージェント以外" },
  { id: "other", label: "その他", hint: "複業クラウドとクラウドソーシングのみ" },
];

const WORK_STYLE_OPTIONS: CatalogChoice<string>[] = [
  { id: "remote", label: "リモート" },
  { id: "hybrid", label: "ハイブリッド" },
  { id: "onsite", label: "現地" },
];

const FALLBACK_NOTE =
  "毎日の指揮が必要になったら、この4媒体への掲載は止め、有期雇用（fixed_term）に切り替える。";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function forbiddenKeys(value: Record<string, unknown>): string[] {
  return FORBIDDEN_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function recommendMonthlyHoursBand(days: number, hours: number): MonthlyHoursBand {
  const monthly = days * hours * 4;
  if (monthly <= 68) return "40";
  if (monthly <= 128) return "96";
  return "160";
}

function contractLabel(form: "quasi_mandate" | "contract_for_work"): string {
  return form === "quasi_mandate" ? "準委任" : "請負";
}

function workStyleLabel(style: "remote" | "hybrid" | "onsite"): string {
  if (style === "remote") return "リモート";
  if (style === "hybrid") return "ハイブリッド";
  return "現地";
}

function roleLabel(role: PlatformRoleFamily): string {
  return ROLE_OPTIONS.find((row) => row.id === role)?.label ?? role;
}

function baseBody(input: Required<Pick<PlatformListingInput,
  "title" | "scope" | "deliverables" | "max_months" | "contract_form" | "monthly_jpy" | "days_per_week" | "hours_per_day" | "monthly_hours_band" | "work_style" | "skills" | "role_family"
>> & PlatformListingInput): string[] {
  const lines = [
    input.title,
    "",
    `契約: 業務委託（${contractLabel(input.contract_form!)}）。会社は日常の指揮命令をしない。`,
    `期間: 初回3ヶ月。最長${input.max_months}ヶ月。更新は3ヶ月単位で協議。`,
    `報酬: 月額${input.monthly_jpy}円（税別の目安。媒体手数料は別）。`,
    `稼働: 週${input.days_per_week}日・1日${input.hours_per_day}時間。月間目安${input.monthly_hours_band}時間。`,
    `働き方: ${workStyleLabel(input.work_style!)}`,
    `職種: ${roleLabel(input.role_family!)}`,
    `業務範囲: ${input.scope}`,
    `成果物: ${input.deliverables}`,
    `スキル: ${input.skills!.join("、")}`,
  ];
  if (input.starts_on) lines.push(`開始目安: ${input.starts_on}`);
  if (input.worksite_id && input.work_style !== "remote") {
    lines.push(`就業拠点: ${input.worksite_id}`);
  }
  lines.push("年齢・性別では選考しない。");
  return lines;
}

function listingBody(platform: PlatformListingId, lines: string[]): string {
  const note: Record<PlatformListingId, string> = {
    workship: "媒体: Workship。月末締めの3ヶ月単位。法人の準委任を前提にする。",
    fukugyo_cloud: "媒体: 複業クラウド。企業と本人の直接契約。月間時間・週日数・1日時間を掲載する。",
    crowdsourcing: "媒体: クラウドワークス / ランサーズ。継続案件。納品物と月額を書く。",
    it_agent: "媒体: ITプロパートナーズ / レバテックフリーランス。月額単価と3ヶ月更新の紹介用メモ。外部公開はしない。",
  };
  return [...lines, "", note[platform]].join("\n");
}

export function buildPlatformListings(input: unknown): PlatformListingResult {
  if (!isRecord(input)) {
    return { status: "rejected", reason: "掲載事実を読めません" };
  }
  const forbidden = forbiddenKeys(input);
  if (forbidden.length > 0) {
    return { status: "rejected", reason: `年齢・性別では選考しない（${forbidden.join(", ")}）` };
  }
  const parsed = platformListingInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "rejected", reason: "掲載事実を読めません" };
  }
  const facts = parsed.data;
  const blob = [facts.title, facts.scope, facts.deliverables, ...(facts.skills ?? [])].filter(Boolean).join("\n");
  if (DIRECTION_TEXT.test(blob)) {
    return {
      status: "use_employment",
      engagement: "fixed_term",
      reason: "指揮命令を含む仕事は業務委託媒体に出さない。有期雇用に切り替える。",
    };
  }
  if (facts.company_directs_daily === true) {
    return {
      status: "use_employment",
      engagement: "fixed_term",
      reason: "毎日の指揮が必要なら、この4媒体には出さず有期雇用にする。",
    };
  }

  const questions: PlatformListingQuestion[] = [];
  if (!facts.title) questions.push({ field: "title", prompt: "案件名は何ですか。" });
  if (!facts.scope) questions.push({ field: "scope", prompt: "業務範囲（成果で区切る）は何ですか。" });
  if (!facts.deliverables) questions.push({ field: "deliverables", prompt: "成果物は何ですか。" });
  if (!facts.monthly_jpy) questions.push({ field: "monthly_jpy", prompt: "月額（円）はいくらですか。時給からは計算しません。" });
  if (!facts.days_per_week) {
    questions.push({
      field: "days_per_week",
      prompt: "週何日ですか。",
      options: [1, 2, 3, 4, 5].map((day) => ({ id: String(day), label: `週${day}日` })),
    });
  }
  if (!facts.hours_per_day) {
    questions.push({
      field: "hours_per_day",
      prompt: "1日何時間ですか。",
      options: [2, 4, 6, 8].map((hour) => ({ id: String(hour), label: `${hour}時間` })),
    });
  }
  if (!facts.work_style) {
    questions.push({
      field: "work_style",
      prompt: "働き方はどれですか。",
      options: WORK_STYLE_OPTIONS,
    });
  }
  if ((facts.work_style === "onsite" || facts.work_style === "hybrid") && !facts.worksite_id) {
    questions.push({ field: "worksite_id", prompt: "就業拠点の worksite_id はどれですか。" });
  }
  if (!facts.skills) questions.push({ field: "skills", prompt: "必要なスキルを1つ以上ください。年齢・性別は不可です。" });
  if (!facts.role_family) {
    questions.push({
      field: "role_family",
      prompt: "職種はどれですか。",
      options: ROLE_OPTIONS,
      recommended: "engineer",
    });
  }
  if (!facts.monthly_hours_band && facts.days_per_week && facts.hours_per_day) {
    questions.push({
      field: "monthly_hours_band",
      prompt: "月間稼働の目安はどれですか。",
      options: HOUR_BANDS,
      recommended: recommendMonthlyHoursBand(facts.days_per_week, facts.hours_per_day),
    });
  } else if (!facts.monthly_hours_band) {
    questions.push({
      field: "monthly_hours_band",
      prompt: "月間稼働の目安はどれですか。",
      options: HOUR_BANDS,
    });
  }
  if (questions.length > 0) return { status: "need_answers", questions };

  const ready = facts as PlatformListingInput & {
    title: string;
    scope: string;
    deliverables: string;
    monthly_jpy: number;
    days_per_week: number;
    hours_per_day: number;
    monthly_hours_band: MonthlyHoursBand;
    work_style: "remote" | "hybrid" | "onsite";
    skills: string[];
    role_family: PlatformRoleFamily;
    contract_form: "quasi_mandate" | "contract_for_work";
    max_months: 3 | 6;
  };
  ready.contract_form = facts.contract_form ?? "quasi_mandate";
  ready.max_months = facts.max_months ?? 6;

  const lines = baseBody(ready);
  const listings = (Object.keys(PLATFORM_TARGETS) as PlatformListingId[]).map((platform) => {
    const targets = PLATFORM_TARGETS[platform];
    if (!ROLE_FIT[platform].includes(ready.role_family)) {
      return {
        platform,
        targets,
        status: "not_applicable" as const,
        reason: `${roleLabel(ready.role_family)}はこの媒体の対象職種ではない`,
      };
    }
    return {
      platform,
      targets,
      status: "ready" as const,
      body: listingBody(platform, lines),
    };
  });

  const applicable = listings.filter((row) => row.status === "ready");
  return {
    status: "ready",
    engagement: "contractor",
    coverage: applicable.length === listings.length ? "all" : "partial",
    assumed: [
      { field: "company_directs_daily", value: "false" },
      { field: "contract_form", value: ready.contract_form },
      { field: "initial_months", value: "3" },
      { field: "max_months", value: String(ready.max_months) },
    ],
    fallback_note: FALLBACK_NOTE,
    listings,
  };
}
