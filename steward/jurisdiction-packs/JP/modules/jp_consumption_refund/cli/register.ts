import type { ConsumptionTaxClaimKind } from "../../../../../../schemas/finance/consumption-tax.js";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  REFUND_ADVANCE_TARGETS,
  runRefundAdvance,
  runRefundEligibility,
  runRefundFile,
  runRefundPack,
  runRefundPropose,
  runRefundReceive,
  runRefundShow,
  runRefundStatus,
  runRefundValidate,
} from "./commands.js";
import { MODULE_ID } from "./lib.js";

const CLAIM_KINDS: ConsumptionTaxClaimKind[] = [
  "principle_net",
  "export",
  "simplified",
  "interim",
];

function parseKind(raw: string | undefined): ConsumptionTaxClaimKind {
  if (!raw || !CLAIM_KINDS.includes(raw as ConsumptionTaxClaimKind)) {
    throw new Error(`--kind must be one of ${CLAIM_KINDS.join(", ")}`);
  }
  return raw as ConsumptionTaxClaimKind;
}

function parseMethod(raw: string | undefined): "standard" | "simplified" | undefined {
  if (!raw) return undefined;
  return raw === "simplified" ? "simplified" : "standard";
}

export { MODULE_ID };

export const jp_consumption_refundCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("consumption-refund")
      .description("JP consumption tax refund claims (jp_consumption_refund)");

    cmd
      .command("show")
      .description("List refund claims")
      .option("--json")
      .action((opts: { json?: boolean }) => runRefundShow({ json: Boolean(opts.json) }));

    cmd
      .command("validate")
      .description("Validate claim ledger (module must be enabled)")
      .action(() => runRefundValidate());

    cmd
      .command("eligibility")
      .description("Refund claim-kind gates (does not file)")
      .requiredOption("--period <YYYY-MM>", "Tax period")
      .option("--method <method>", "standard or simplified")
      .option("--deemed-rate <pct>", "Simplified deemed purchase rate", (v: string) => Number(v))
      .option("--json")
      .action((opts: {
        period: string;
        method?: string;
        deemedRate?: number;
        json?: boolean;
      }) =>
        runRefundEligibility({
          period: opts.period,
          method: parseMethod(opts.method),
          deemedRate: opts.deemedRate,
          json: Boolean(opts.json),
        }),
      );

    cmd
      .command("propose")
      .description("Open a draft CLAIM from Assessment (module must be enabled)")
      .requiredOption("--period <YYYY-MM>", "Tax period")
      .requiredOption("--kind <kind>", "principle_net | export | simplified | interim")
      .option("--method <method>", "standard or simplified")
      .option("--deemed-rate <pct>", "Simplified deemed purchase rate", (v: string) => Number(v))
      .option("--exception-basis <path>", "Advisor memo path (simplified only)")
      .option("--json")
      .action((opts: {
        period: string;
        kind: string;
        method?: string;
        deemedRate?: number;
        exceptionBasis?: string;
        json?: boolean;
      }) =>
        runRefundPropose({
          period: opts.period,
          kind: parseKind(opts.kind),
          method: parseMethod(opts.method),
          deemedRate: opts.deemedRate,
          exceptionBasis: opts.exceptionBasis,
          json: Boolean(opts.json),
        }),
      );

    cmd
      .command("pack")
      .description("Write L1 refund pack markdown (module must be enabled)")
      .requiredOption("--id <CLAIM-...>", "Claim id")
      .option("--json")
      .action((opts: { id: string; json?: boolean }) =>
        runRefundPack({ id: opts.id, json: Boolean(opts.json) }),
      );

    cmd
      .command("status")
      .description("Show one claim")
      .requiredOption("--id <CLAIM-...>", "Claim id")
      .option("--json")
      .action((opts: { id: string; json?: boolean }) =>
        runRefundStatus({ id: opts.id, json: Boolean(opts.json) }),
      );

    cmd
      .command("advance")
      .description("Move a claim to advisor_review / ready_to_file / rejected")
      .requiredOption("--id <CLAIM-...>", "Claim id")
      .requiredOption("--to <status>", REFUND_ADVANCE_TARGETS.join(" | "))
      .option("--json")
      .action((opts: { id: string; to: string; json?: boolean }) => {
        if (!REFUND_ADVANCE_TARGETS.includes(opts.to as (typeof REFUND_ADVANCE_TARGETS)[number])) {
          throw new Error(`--to must be one of ${REFUND_ADVANCE_TARGETS.join(", ")}`);
        }
        runRefundAdvance({
          id: opts.id,
          to: opts.to as (typeof REFUND_ADVANCE_TARGETS)[number],
          json: Boolean(opts.json),
        });
      });

    cmd
      .command("file")
      .description("Record human filing (does not submit e-Tax)")
      .requiredOption("--id <CLAIM-...>", "Claim id")
      .option("--filed-on <YYYY-MM-DD>", "Filing date")
      .option("--json")
      .action((opts: { id: string; filedOn?: string; json?: boolean }) =>
        runRefundFile({ id: opts.id, filedOn: opts.filedOn, json: Boolean(opts.json) }),
      );

    cmd
      .command("receive")
      .description("Record refund cash and post GL journal (human / finance)")
      .requiredOption("--id <CLAIM-...>", "Claim id")
      .option("--received-on <YYYY-MM-DD>", "Bank date")
      .option("--bank-account-id <id>", "refund_bank_account_id only")
      .option("--json")
      .action((opts: { id: string; receivedOn?: string; bankAccountId?: string; json?: boolean }) =>
        runRefundReceive({
          id: opts.id,
          receivedOn: opts.receivedOn,
          bankAccountId: opts.bankAccountId,
          json: Boolean(opts.json),
        }),
      );
  },
  skillHandlers: {
    jp_consumption_refund_show: (opts) => runRefundShow({ json: Boolean(opts.json) }),
    jp_consumption_refund_eligibility: (opts) =>
      runRefundEligibility({
        period: String(opts.period ?? ""),
        json: Boolean(opts.json),
      }),
  },
};
