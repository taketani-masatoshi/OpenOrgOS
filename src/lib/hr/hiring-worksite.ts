import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import YAML from "yaml";
import {
  hiringWorksiteSchema,
  type CatalogChoice,
  type HiringWorksite,
  type JobCategoryChoiceId,
  type PassiveSmokingChoiceId,
  type WorksiteConfirmResult,
} from "../../../schemas/talent-hiring.js";

export const PASSIVE_SMOKING_OPTIONS: CatalogChoice<PassiveSmokingChoiceId>[] = [
  {
    id: "indoor_smoke_free",
    label: "屋内禁煙",
    hint: "喫煙室・喫煙所なし。オフィス・住居系の既定",
  },
  {
    id: "smoking_room",
    label: "屋内原則禁煙（喫煙専用室あり）",
    hint: "紙巻きたばこの喫煙専用室がある",
  },
  {
    id: "heated_tobacco_room",
    label: "屋内原則禁煙（加熱式たばこ専用喫煙室あり）",
    hint: "加熱式たばこ専用の室がある",
  },
  {
    id: "smoking_allowed_exception",
    label: "喫煙可（経過措置等）",
    hint: "既存小規模飲食などの例外のみ",
  },
  {
    id: "outdoor_work",
    label: "屋外での就業",
    hint: "就業場所が屋外",
  },
];

export const JOB_CATEGORY_OPTIONS: CatalogChoice<JobCategoryChoiceId>[] = [
  { id: "light_work", label: "軽作業", hint: "仕分け・検品・棚入れなど" },
  { id: "warehouse_logistics", label: "倉庫・物流", hint: "入出庫・ピッキング中心" },
  { id: "cleaning", label: "清掃", hint: "施設・部屋の清掃" },
  { id: "office_assist", label: "オフィス補助", hint: "書類・受付・事務補助" },
  { id: "food_service", label: "飲食", hint: "調理補助・ホール" },
  { id: "other", label: "その他", hint: "上記に当てはまらないときだけ" },
];

export function loadHiringWorksite(input: unknown):
  | { status: "rejected"; reason: string }
  | { status: "ready"; worksite: HiringWorksite } {
  const parsed = hiringWorksiteSchema.safeParse(input);
  if (!parsed.success) return { status: "rejected", reason: "拠点を読めません" };
  return { status: "ready", worksite: parsed.data };
}

export function loadHiringWorksiteFromPath(path: string) {
  return loadHiringWorksite(YAML.parse(readFileSync(path, "utf8")));
}

export function writeHiringWorksite(path: string, worksite: HiringWorksite): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, YAML.stringify(worksite), "utf8");
}

function recommendPassiveSmoking(worksite: HiringWorksite): PassiveSmokingChoiceId | undefined {
  const fact = worksite.passive_smoking_fact;
  if (/喫煙所なし|喫煙室なし|喫煙設備なし/.test(fact)) return "indoor_smoke_free";
  if (/加熱式/.test(fact)) return "heated_tobacco_room";
  if (/喫煙室|喫煙専用/.test(fact)) return "smoking_room";
  if (/屋外/.test(fact)) return "outdoor_work";
  return undefined;
}

function recommendJobCategory(worksite: HiringWorksite): JobCategoryChoiceId | undefined {
  if (worksite.suggested_job_category) return worksite.suggested_job_category;
  const blob = `${worksite.display_name} ${worksite.passive_smoking_fact}`;
  if (/軽作業|検品|棚入|受取|仕分/.test(blob)) return "light_work";
  return undefined;
}

export function confirmHiringWorksite(
  input: unknown,
  choices?: {
    passive_smoking_choice?: PassiveSmokingChoiceId;
    job_category_choice?: JobCategoryChoiceId;
  },
): WorksiteConfirmResult | { status: "rejected"; reason: string } {
  const loaded = loadHiringWorksite(input);
  if (loaded.status === "rejected") return loaded;

  const worksite: HiringWorksite = {
    ...loaded.worksite,
    ...(choices?.passive_smoking_choice
      ? { passive_smoking_choice: choices.passive_smoking_choice }
      : {}),
    ...(choices?.job_category_choice ? { job_category_choice: choices.job_category_choice } : {}),
  };

  const missing: Array<"passive_smoking_choice" | "job_category_choice"> = [];
  if (!worksite.passive_smoking_choice) missing.push("passive_smoking_choice");
  if (!worksite.job_category_choice) missing.push("job_category_choice");

  if (missing.length > 0) {
    const recommended: {
      passive_smoking_choice?: PassiveSmokingChoiceId;
      job_category_choice?: JobCategoryChoiceId;
    } = {};
    const smoke = recommendPassiveSmoking(worksite);
    const category = recommendJobCategory(worksite);
    if (smoke) recommended.passive_smoking_choice = smoke;
    if (category) recommended.job_category_choice = category;
    return {
      status: "need_choices",
      worksite,
      missing,
      passive_smoking_options: PASSIVE_SMOKING_OPTIONS,
      job_category_options: JOB_CATEGORY_OPTIONS,
      recommended: Object.keys(recommended).length > 0 ? recommended : undefined,
    };
  }

  return { status: "ready", worksite };
}

/** 番町ハイム312 — 公開情報で確定した拠点正本（電話など個情は含めない）。 */
export const BANCHO_HEIM_312_WORKSITE: HiringWorksite = {
  worksite_id: "WS-bancho-heim-312",
  display_name: "番町ハイム312",
  address: {
    prefecture: "東京都",
    city: "千代田区",
    line1: "二番町1-2",
    building: "番町ハイム",
    unit: "312",
    postal_code: "102-0084",
  },
  access: {
    nearest_stations: [
      {
        line: "東京メトロ有楽町線",
        station: "麹町",
        walk_minutes: 2,
        exit: "5番出口",
      },
    ],
    entry_method: "312のインターフォンを鳴らす",
  },
  passive_smoking_fact: "喫煙所なし。室内禁煙などの制限・掲示なし",
  passive_smoking_choice: "indoor_smoke_free",
  suggested_job_category: "light_work",
  job_category_choice: "light_work",
  confirmed_at: "2026-09-20",
};
