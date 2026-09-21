import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import {
  analyzeFieldTime,
  proposeDispatch,
  proposeJobCompletion,
  type DispatchJob,
  type DispatchStaff,
} from "../../../../src/lib/propose-surface.js";

export const MODULE_ID = "field_ops";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export const fieldOpsCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "field-ops", "Field jobs — proposals only", {
      show: () => printJson({ module: MODULE_ID, proposeOnly: true }),
      validate: () => printJson({ ok: true }),
    });
    const field = ctx.operationsCmd.commands.find((cmd) => cmd.name() === "field-ops");
    if (!field) return;

    const dispatch = field.command("dispatch").description("Dispatch proposals. GPS traces are not stored");
    dispatch
      .command("propose")
      .description("Propose an assignee from skill, availability, and waypoint")
      .requiredOption("--jobs <json>", "JSON array of jobs")
      .requiredOption("--staff <json>", "JSON array of staff")
      .action((opts: { jobs: string; staff: string }) => {
        printJson(
          proposeDispatch(
            JSON.parse(opts.jobs) as DispatchJob[],
            JSON.parse(opts.staff) as DispatchStaff[],
          ),
        );
      });
    dispatch
      .command("replan")
      .description("Propose a new assignee, excluding staff ids")
      .requiredOption("--jobs <json>", "JSON array of jobs")
      .requiredOption("--staff <json>", "JSON array of staff")
      .requiredOption("--exclude <ids>", "Comma-separated staff ids")
      .action((opts: { jobs: string; staff: string; exclude: string }) => {
        printJson(
          proposeDispatch(
            JSON.parse(opts.jobs) as DispatchJob[],
            JSON.parse(opts.staff) as DispatchStaff[],
            opts.exclude.split(",").filter(Boolean),
          ),
        );
      });

    field
      .command("job")
      .description("Job completion text")
      .command("complete")
      .description("Accept a text report. Stock and notice stay proposals")
      .requiredOption("--job <id>", "Job id")
      .requiredOption("--text <text>", "Report text")
      .action((opts: { job: string; text: string }) => {
        printJson(proposeJobCompletion(opts.text, opts.job));
      });

    field
      .command("analytics")
      .description("Summarize job time and write an improvement note")
      .requiredOption("--rows <json>", "JSON array of {staffId,minutes,travelMinutes}")
      .action((opts: { rows: string }) => {
        printJson({ ...analyzeFieldTime(JSON.parse(opts.rows) as never), ordered: false });
      });
  },
};
