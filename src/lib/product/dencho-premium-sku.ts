/**
 * Electronic ledger "優良" (premium) option SKU — timestamp authority (TSA) placeholder.
 * Basic dencho remains in core Ledger; TSA is a paid add-on (ADR / dencho-sales-claim).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir } from "../utils.js";
import { getClock } from "../runtime-context.js";

const premiumSchema = z.object({
  version: z.literal(1),
  sku: z.literal("dencho-premium-tsa"),
  status: z.enum(["disabled", "enabled", "pending_provider"]),
  provider: z.string().optional(),
  enabled_at: z.string().optional(),
  note: z.string().optional(),
});

export type DenchoPremiumConfig = z.infer<typeof premiumSchema>;

function configPath(): string {
  return join(getDataDir(), "product", "dencho-premium.yaml");
}

export function loadDenchoPremiumConfig(): DenchoPremiumConfig {
  const path = configPath();
  if (!existsSync(path)) {
    return premiumSchema.parse({
      version: 1,
      sku: "dencho-premium-tsa",
      status: "disabled",
      note: "優良要件（タイムスタンプ局）は別オプション",
    });
  }
  return premiumSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function enableDenchoPremium(input?: {
  provider?: string;
}): DenchoPremiumConfig {
  const record = premiumSchema.parse({
    version: 1,
    sku: "dencho-premium-tsa",
    status: input?.provider ? "enabled" : "pending_provider",
    provider: input?.provider ?? "pending",
    enabled_at: getClock().now().toISOString(),
    note: "TSA provider wiring is product option — not included in base Ledger",
  });
  mkdirSync(join(getDataDir(), "product"), { recursive: true });
  writeFileSync(configPath(), YAML.stringify(record), "utf-8");
  return record;
}

export function buildDenchoSkuSnapshot() {
  const premium = loadDenchoPremiumConfig();
  return {
    base: {
      sku: "dencho-basic",
      claim: "電子帳簿保存法 基本要件（検索・訂正削除履歴）",
      included_in_ledger: true,
    },
    premium: {
      sku: premium.sku,
      status: premium.status,
      provider: premium.provider,
      claim: "優良要件（タイムスタンプ局）— 別オプション",
      included_in_ledger: false,
    },
  };
}
