import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import {
  runInvestorRelationsBriefing,
  runInvestorRelationsCapTableReview,
  runInvestorRelationsDisclosureCalendar,
  runInvestorRelationsShow,
  runInvestorRelationsValidate,
} from "./commands.js";

export const MODULE_ID = "investor_relations";

function runCapTableReviewSkill(opts: SkillRunOptions): void {
  runInvestorRelationsCapTableReview({
    json: opts.json,
    output: opts.output,
  });
}

function runDisclosureCalendarSkill(opts: SkillRunOptions): void {
  runInvestorRelationsDisclosureCalendar({
    json: opts.json,
    output: opts.output,
    days: opts.days,
  });
}

export const investor_relationsCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const ir = ctx.operationsCmd
      .command("ir")
      .description("Investor relations — cap table · disclosure calendar · briefing");

    ir.command("show")
      .description("IR module status summary")
      .option("--json", "JSON output")
      .action((opts: { json?: boolean }) => runInvestorRelationsShow({ json: Boolean(opts.json) }));

    ir.command("validate")
      .description("Validate IR data files")
      .action(() => runInvestorRelationsValidate());

    ir.command("briefing")
      .description("IR executive briefing")
      .option("--json", "JSON output")
      .option("-o, --output <filename>", "Write to agent-summaries/investor-relations/")
      .option("--today <YYYY-MM-DD>", "Anchor date")
      .action((opts: { json?: boolean; output?: string; today?: string }) =>
        runInvestorRelationsBriefing({
          json: Boolean(opts.json),
          output: opts.output,
          today: opts.today,
        }),
      );

    ir.command("cap-table-review")
      .description("Review cap table totals and duplicates")
      .option("--json", "JSON output")
      .option("-o, --output <filename>", "Write markdown report")
      .action((opts: { json?: boolean; output?: string }) =>
        runInvestorRelationsCapTableReview({
          json: Boolean(opts.json),
          output: opts.output,
        }),
      );

    ir.command("disclosure-calendar")
      .description("Upcoming disclosure items")
      .option("--json", "JSON output")
      .option("-o, --output <filename>", "Write markdown report")
      .option("--today <YYYY-MM-DD>", "Anchor date")
      .option("--days <n>", "Horizon days", (v) => Number(v))
      .action((opts: { json?: boolean; output?: string; today?: string; days?: number }) =>
        runInvestorRelationsDisclosureCalendar({
          json: Boolean(opts.json),
          output: opts.output,
          today: opts.today,
          days: opts.days,
        }),
      );
  },
  skillHandlers: {
    ir_cap_table_review: runCapTableReviewSkill,
    ir_disclosure_calendar: runDisclosureCalendarSkill,
  },
};
