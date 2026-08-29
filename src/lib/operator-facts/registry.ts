import type { FactProvider } from "./types.js";
import { hrHeadcountProvider } from "./providers/hr-headcount.js";
import { companyOfficersProvider } from "./providers/company-officers.js";
import { financeMetricsProvider } from "./providers/finance-metrics.js";
import { cashCounterpartiesProvider } from "./providers/cash-counterparties.js";
import { contractStatusProvider } from "./providers/contract-status.js";
import { salesInboundProvider } from "./providers/sales-inbound.js";
import { salesOutboundProvider } from "./providers/sales-outbound.js";
import { salesPipelineProvider } from "./providers/sales-pipeline.js";
import { customerSuccessProvider } from "./providers/customer-success.js";
import { analyticsKpiProvider } from "./providers/analytics-kpi.js";
import { pmoPortfolioProvider } from "./providers/pmo-portfolio.js";
import { investorRelationsBriefingProvider } from "./providers/investor-relations-briefing.js";

const PROVIDERS: FactProvider[] = [
  hrHeadcountProvider,
  companyOfficersProvider,
  financeMetricsProvider,
  cashCounterpartiesProvider,
  contractStatusProvider,
  analyticsKpiProvider,
  salesInboundProvider,
  salesOutboundProvider,
  salesPipelineProvider,
  customerSuccessProvider,
  pmoPortfolioProvider,
  investorRelationsBriefingProvider,
];

let validated = false;

function assertUniqueToolNames(providers: FactProvider[]): void {
  const seen = new Set<string>();
  for (const p of providers) {
    if (seen.has(p.toolName)) {
      throw new Error(`Duplicate fact provider toolName: ${p.toolName}`);
    }
    if (seen.has(p.id)) {
      throw new Error(`Duplicate fact provider id: ${p.id}`);
    }
    seen.add(p.toolName);
    seen.add(p.id);
  }
}

export function listFactProviders(): FactProvider[] {
  if (!validated) {
    assertUniqueToolNames(PROVIDERS);
    validated = true;
  }
  return PROVIDERS;
}

export function findProviderByTool(toolName: string): FactProvider | undefined {
  return listFactProviders().find((p) => p.toolName === toolName);
}

export function findProviderById(id: string): FactProvider | undefined {
  return listFactProviders().find((p) => p.id === id);
}

export function matchProviderByIntent(message: string): FactProvider | undefined {
  const n = message.normalize("NFKC").trim();
  return listFactProviders().find((p) => p.intent.test(n));
}

export function matchProviderByTopic(message: string): FactProvider | undefined {
  const n = message.normalize("NFKC").trim();
  return listFactProviders().find((p) => p.topic.test(n));
}

export function formatFactGroundingLines(): string[] {
  return listFactProviders().map(
    (p) =>
      `- **${p.groundingLabel}** — answered deterministically via \`${p.toolName}\` / pre-handler before LLM. Do not refuse or invent numbers.`
  );
}
