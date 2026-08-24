import type { FactProvider } from "./types.js";
import { hrHeadcountProvider } from "./providers/hr-headcount.js";
import { financeMetricsProvider } from "./providers/finance-metrics.js";
import { contractStatusProvider } from "./providers/contract-status.js";

const PROVIDERS: FactProvider[] = [
  hrHeadcountProvider,
  financeMetricsProvider,
  contractStatusProvider,
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
