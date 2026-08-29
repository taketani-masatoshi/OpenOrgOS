import {
  buildCompanyOfficersView,
  formatCompanyOfficersCeoReply,
  type CompanyOfficersView,
} from "../../company-officers-view.js";
import type { FactProvider, FactResult } from "../types.js";

/** Who / name of the registered representative director — not 取締役会 scheduling. */
export function isCompanyOfficersChatIntent(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (!n) return false;
  if (/取締役会/.test(n) && !/代表取締役/.test(n)) return false;
  if (/代表電話|代表メール|代表番号/.test(n)) return false;

  const asksIdentity = /(?:誰|だれ|どなた|氏名|名前|お名前|教えて|who)/iu.test(n);
  if (/代表取締役/.test(n) && asksIdentity) return true;
  if (/(?:代表者|代表社員|社長|CEO)/iu.test(n) && asksIdentity) return true;
  return /who\s+is\s+(?:the\s+)?(?:representative\s+director|ceo|president)/iu.test(n);
}

export function mentionsCompanyOfficersTopic(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (/取締役会/.test(n) && !/代表取締役/.test(n)) return false;
  return /代表取締役|(?:代表者|社長|CEO)(?:は誰|の名前|の氏名)|representative\s+director/iu.test(
    n
  );
}

const OFFICERS_REFUSAL =
  /(?:コンテキストからは|コンテキスト内には).{0,80}(?:代表取締役|氏名).{0,40}(?:確認できません|登録されていません)|代表取締役様の氏名は確認できません|company_context\.md/iu;

export const companyOfficersProvider: FactProvider<CompanyOfficersView> = {
  id: "company_officers",
  toolName: "operator_company_officers",
  description:
    "Deterministic L0 representative directors from data/company.yaml. Never returns address.",
  permission: "chat:read",
  intent: {
    test: (s: string) => isCompanyOfficersChatIntent(s),
  } as RegExp,
  topic: {
    test: (s: string) => mentionsCompanyOfficersTopic(s),
  } as RegExp,
  ownerAgent: "corporate_governance",
  escalate: {
    path: "data/company.yaml",
    routeBoost: "会社概要・代表取締役（company.yaml）の確認",
  },
  groundingLabel: "代表取締役 / 代表者氏名",
  escalateOnUnregistered: false,
  looksLikeRefusal: (reply) => OFFICERS_REFUSAL.test(reply.normalize("NFKC")),
  run(): FactResult<CompanyOfficersView> {
    const view = buildCompanyOfficersView();
    return {
      ok: view.coverage === "registered",
      coverage: view.coverage,
      view,
      structuredKey: "company_officers",
      reply: formatCompanyOfficersCeoReply(view),
    };
  },
  format: formatCompanyOfficersCeoReply,
};
