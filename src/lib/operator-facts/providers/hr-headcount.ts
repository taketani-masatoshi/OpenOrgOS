import {
  buildHeadcountView,
  formatHeadcountCeoReply,
  type HeadcountView,
} from "../../hr/headcount-view.js";
import type { FactProvider, FactResult } from "../types.js";

const HR_INTENT =
  /従業員(?:の)?(?:数|人数|は|が|を)|社員(?:の)?(?:数|人数|は|が|を)|人員(?:の)?(?:数|人数|は|が|を|集計)|在籍(?:の)?(?:人数|者数|は|が)|頭数|head\s*count|headcount|(?:何人|何名).{0,12}(?:従業員|社員|人員|在籍)|(?:従業員|社員|人員|在籍).{0,16}(?:何人|何名|いくつ|人数|数は|数を|数って)|人事.{0,8}人数|employee\s*count|how\s*many\s*employees/iu;

const HR_TOPIC =
  /従業員|社員|人員|在籍|頭数|headcount|head\s*count|employee|人事マスタ|HR\s*マスタ/iu;

const HR_REFUSAL =
  /employees\.yaml|data\/hr\/|HRシステム|人事データ|コンテキストには具体的な最新の人数|正確な従業員数を把握するためには|Human Resources Agent|人事エージェントへ|ここにプラットフォームが計算した|最新のL1集計値が入ります|\*\*XX\s*名\*\*|在籍人数は\s*\*\*XX|（※ここに|決定論パスを通じて情報を取得|#\s*人員集計|職種別|雇用形態別|突き合わせ|loadEmployees\(\)/iu;

export const hrHeadcountProvider: FactProvider<HeadcountView> = {
  id: "hr_headcount",
  toolName: "operator_hr_headcount",
  description:
    "Deterministic L1 headcount from data/hr/employees.yaml (active/leave/inactive counts and job_type breakdown). Never returns names.",
  permission: "chat:read",
  intent: HR_INTENT,
  topic: HR_TOPIC,
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
