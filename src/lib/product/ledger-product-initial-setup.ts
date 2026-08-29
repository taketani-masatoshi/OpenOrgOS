import { hydrateStripeEnvFromStore } from "./stripe-secrets-store.js";
import {
  buildStripeBillingStatus,
  isStripeBillingCommercialReady,
} from "./stripe-ops.js";
import { buildCommercialReadinessReport } from "./ledger-commercial-readiness.js";
import { hasQualityRestoreDrill } from "./ledger-restore-drills.js";
import { isLegalDocumentationCounselSigned } from "./ledger-legal-attestation.js";
import { hasRecentSuccessfulSmtpMail } from "./ledger-mail.js";

export type ProductInitialSetupStep = {
  id: string;
  label: string;
  complete: boolean;
  detail?: string;
  /** Pre-production: test keys OK; live keys required before external go-live billing. */
  phase: "pre_production" | "go_live";
};

export type ProductInitialSetupReport = {
  pre_production_ready: boolean;
  commercial_score: number;
  commercial_ready: boolean;
  stripe_mode: "stub" | "test" | "live";
  stripe_configured: boolean;
  webhook_path: string;
  storage_path: string;
  steps: ProductInitialSetupStep[];
};

export function buildProductInitialSetupReport(): ProductInitialSetupReport {
  hydrateStripeEnvFromStore();
  const billing = buildStripeBillingStatus();
  const commercial = buildCommercialReadinessReport();

  const steps: ProductInitialSetupStep[] = [
    {
      id: "stripe-keys",
      label: "Stripe Secret + Webhook Secret",
      complete: isStripeBillingCommercialReady(),
      detail: billing.commercial_ready
        ? `mode=${billing.mode} · ${billing.attestation.status}`
        : "初期設定フォームで入力（本番前に test キー可）",
      phase: "pre_production",
    },
    {
      id: "stripe-live",
      label: "Stripe live キー（セルフサーブ課金の本番投入時）",
      complete: billing.mode === "live",
      detail:
        billing.mode === "live"
          ? "sk_live_* 設定済み"
          : "外部宣言・live 課金前に Dashboard で live キーへ差し替え",
      phase: "go_live",
    },
    {
      id: "mail-smtp",
      label: "SMTP mail-drill",
      complete: hasRecentSuccessfulSmtpMail(),
      detail: hasRecentSuccessfulSmtpMail() ? "30日以内の送信成功" : "未実施",
      phase: "pre_production",
    },
    {
      id: "legal",
      label: "法務 counsel 署名",
      complete: isLegalDocumentationCounselSigned(),
      phase: "pre_production",
    },
    {
      id: "restore",
      label: "復旧ドリル（品質ゲート）",
      complete: hasQualityRestoreDrill(),
      phase: "pre_production",
    },
  ];

  const preProductionSteps = steps.filter((row) => row.phase === "pre_production");
  const preProductionReady = preProductionSteps.every((row) => row.complete);

  return {
    pre_production_ready: preProductionReady,
    commercial_score: commercial.score,
    commercial_ready: commercial.score >= 100,
    stripe_mode: billing.mode,
    stripe_configured: billing.commercial_ready,
    webhook_path: billing.webhook_path,
    storage_path: "data/product/stripe-secrets.env",
    steps,
  };
}
