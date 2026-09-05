import {
  buildHeadcountView,
  formatHeadcountCeoReply,
  type HeadcountView,
} from "../../hr/headcount-view.js";
import type { FactProvider, FactResult } from "../types.js";

/** Count questions only — `社員が` / `従業員は` must not steal hire / onboarding. */
const HR_COUNT_INTENT =
  /従業員(?:の)?(?:数|人数)|社員(?:の)?(?:数|人数)|人員(?:の)?(?:数|人数|集計)|在籍(?:の)?(?:人数|者数)|頭数|head\s*count|headcount|(?:何人|何名).{0,12}(?:従業員|社員|人員|在籍)|(?:従業員|社員|人員|在籍).{0,16}(?:何人|何名|いくつ|人数|数は|数を|数って)|人事.{0,8}人数|employee\s*count|how\s*many\s*employees|^(?:いまの)?(?:従業員|社員|人員|在籍)(?:数|人数)?(?:は|って)?[？?]?$/iu;

/** Hire / payroll / name actions — leave to Steward / HR, not the headcount one-liner. */
const HR_ACTION_OR_PERSON =
  /入社|退社|退職|採用|雇用契約|労働条件|手続き|手続|オンボ|onboard|welcome|hire|joined|new\s*hire|社保|雇用保険|名簿に載|追加して|登録して|名前は|氏名|さんです|さんを|さんが入/iu;

export function isHrHeadcountActionRequest(message: string): boolean {
  return HR_ACTION_OR_PERSON.test(message.normalize("NFKC").trim());
}

export function isHrHeadcountChatIntent(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (!n || isHrHeadcountActionRequest(n)) return false;
  return HR_COUNT_INTENT.test(n);
}

/** Refusal-guard topic: still a count question, not any mention of 社員. */
export function isHrHeadcountTopic(message: string): boolean {
  return isHrHeadcountChatIntent(message);
}

const HR_REFUSAL =
  /employees\.yaml|data\/hr\/|HRシステム|人事データ|コンテキストには具体的な最新の人数|正確な従業員数を把握するためには|Human Resources Agent|人事エージェントへ|ここにプラットフォームが計算した|最新のL1集計値が入ります|\*\*XX\s*名\*\*|在籍人数は\s*\*\*XX|（※ここに|決定論パスを通じて情報を取得|#\s*人員集計|職種別|雇用形態別|突き合わせ|loadEmployees\(\)/iu;

export const hrHeadcountProvider: FactProvider<HeadcountView> = {
  id: "hr_headcount",
  toolName: "operator_hr_headcount",
  description:
    "Deterministic L1 headcount from data/hr/employees.yaml (active/leave/inactive counts and job_type breakdown). Never returns names.",
  permission: "chat:read",
  intent: {
    test: (s: string) => isHrHeadcountChatIntent(s),
  } as RegExp,
  topic: {
    test: (s: string) => isHrHeadcountTopic(s),
  } as RegExp,
  ownerAgent: "human_resources",
  escalate: {
    path: "data/hr/",
    routeBoost: "人事・在籍人員の確認（employees.yaml 整備）",
  },
  groundingLabel: "従業員数 / 在籍人数 / headcount",
  escalateOnUnregistered: true,
  looksLikeRefusal: (reply) => HR_REFUSAL.test(reply.normalize("NFKC")),
  run(): FactResult<HeadcountView> {
    const view = buildHeadcountView();
    return {
      ok: view.coverage !== "unregistered",
      coverage: view.coverage,
      view,
      structuredKey: "hr_headcount",
      reply: formatHeadcountCeoReply(view),
    };
  },
  /** Chat / tools use the brief reply; full markdown is CLI-only (`orgos hr headcount`). */
  format: formatHeadcountCeoReply,
};
