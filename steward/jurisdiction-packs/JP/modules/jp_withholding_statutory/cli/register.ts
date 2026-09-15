import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { runJpWithholdingPaymentSkill } from "../../../../../../src/lib/finance/tax-skill-runners.js";
import { runTaxCalendar } from "../../../../../../src/commands/tax.js";
import {
  writePaymentSlipsDraft,
  writeWithholdingPaymentJournalDrafts,
  postWithholdingRemittanceJournal,
} from "../../../../../../src/lib/finance/withholding-payments.js";
import { reconcileWithholdingVsGl } from "../../../../../../src/lib/finance/sole-prop-year-end.js";
import { resolveSolePropCalendarYear } from "../../../../../../src/lib/finance/sole-prop-year.js";

export const MODULE_ID = "jp_withholding_statutory";

export const jp_withholding_statutoryCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("withholding")
      .description("JP withholding / statutory calendar (jp_withholding_statutory)");

    cmd
      .command("calendar")
      .description("Expand withholding and social insurance rhythms")
      .option("--today <YYYY-MM-DD>")
      .option("--json")
      .action((opts: { today?: string; json?: boolean }) =>
        runTaxCalendar({ today: opts.today, json: Boolean(opts.json) }),
      );

    cmd
      .command("payment-journal-draft")
      .description("Draft journal lines for reward/fee withholding payments")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => {
        const year = Number.parseInt(opts.year ?? String(new Date().getFullYear()), 10);
        const result = writeWithholdingPaymentJournalDrafts(year);
        if (opts.json) console.log(JSON.stringify(result, null, 2));
        else console.log(`✓ 仕訳案 ${result.count} 件`);
      });

    cmd
      .command("payment-slips")
      .description("Payment slip amount draft (not filing XML)")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => {
        const year = Number.parseInt(opts.year ?? String(new Date().getFullYear()), 10);
        const { path, draft } = writePaymentSlipsDraft(year);
        if (opts.json) console.log(JSON.stringify({ path, draft }, null, 2));
        else {
          console.log(`✓ 支払調書ドラフト → ${path}`);
          for (const i of draft.issues) console.warn(`  ⚠ ${i}`);
        }
      });

    cmd
      .command("remittance-post")
      .description("Append withholding remittance journal (預り金 Dr / 預金 Cr)")
      .requiredOption("--payment-id <id>", "withholding-payments.yaml payment_id")
      .requiredOption("--remitted-at <YYYY-MM-DD>", "Remittance date")
      .option("--authorized-by <id>", "Poster id", "withholding-remit")
      .option("--json")
      .action(
        (opts: {
          paymentId: string;
          remittedAt: string;
          authorizedBy?: string;
          json?: boolean;
        }) => {
          const result = postWithholdingRemittanceJournal({
            paymentId: opts.paymentId,
            remittedAt: opts.remittedAt,
            authorizedBy: opts.authorizedBy,
          });
          if (opts.json) console.log(JSON.stringify(result, null, 2));
          else {
            console.log(
              `✓ ${result.posted ? "posted" : "already exists"} ${result.entry_id} · 源泉 ${result.withholding_yen.toLocaleString("ja-JP")} 円`,
            );
          }
        },
      );

    cmd
      .command("reconcile")
      .description("Compare withholding-payments YAML totals vs GL 預り金 (read-only)")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => {
        const year = resolveSolePropCalendarYear({ explicit: opts.year });
        const r = reconcileWithholdingVsGl(year);
        if (opts.json) {
          console.log(JSON.stringify({ year, ...r }, null, 2));
          return;
        }
        console.log(
          `year ${year} · YAML ${r.yaml_total_yen.toLocaleString("ja-JP")} · GL ${r.payable_code} ${r.gl_yen.toLocaleString("ja-JP")} · 差 ${r.delta_yen.toLocaleString("ja-JP")}`,
        );
      });
  },
  skillHandlers: {
    jp_withholding_payment: runJpWithholdingPaymentSkill,
  },
};
