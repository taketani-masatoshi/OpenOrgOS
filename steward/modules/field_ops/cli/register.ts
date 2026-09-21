import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import {
  renderDispatchReport,
  renderFieldAnalyticsReport,
  renderFieldIntakeReport,
  renderFieldInterfaceReport,
  renderJobCompletionReport,
  renderReplanReport,
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
      .description("Propose an assignee from skill, availability, waypoint, and load")
      .option("--jobs <json>", "JSON array of jobs (omit to read field_ops/jobs.yaml)")
      .option("--staff <json>", "JSON array of staff (omit to read field_ops/staff.yaml)")
      .action((opts: { jobs?: string; staff?: string }) => {
        printJson(
          renderDispatchReport(
            opts.jobs ? (JSON.parse(opts.jobs) as DispatchJob[]) : undefined,
            opts.staff ? (JSON.parse(opts.staff) as DispatchStaff[]) : undefined,
          ),
        );
      });
    dispatch
      .command("replan")
      .description("Propose a new assignee, excluding staff ids")
      .option("--jobs <json>", "JSON array of jobs (omit to read field_ops/jobs.yaml)")
      .option("--staff <json>", "JSON array of staff (omit to read field_ops/staff.yaml)")
      .requiredOption("--exclude <ids>", "Comma-separated staff ids")
      .action((opts: { jobs?: string; staff?: string; exclude: string }) => {
        printJson(
          renderReplanReport(
            opts.jobs ? (JSON.parse(opts.jobs) as DispatchJob[]) : undefined,
            opts.staff ? (JSON.parse(opts.staff) as DispatchStaff[]) : undefined,
            opts.exclude.split(",").filter(Boolean),
          ),
        );
      });

    field
      .command("job")
      .description("Job completion text")
      .command("complete")
      .description("Accept a text report or UTF-8 file. Stock preview only — no deduct")
      .requiredOption("--job <id>", "Job id")
      .option("--text <text>", "Report text or UTF-8 file path")
      .option("--file <path>", "UTF-8 report file (overrides --text when set)")
      .action((opts: { job: string; text?: string; file?: string }) => {
        const source = opts.file ?? opts.text;
        if (!source) throw new Error("pass --text <fixture|path> or --file <path>");
        printJson(renderJobCompletionReport(source, opts.job));
      });

    field
      .command("intake")
      .description("Accept mail/chat/text/voice-transcript. No standing bot or live STT")
      .requiredOption("--channel <name>", "mail | chat | voice_transcript | text")
      .requiredOption("--job <id>", "Job id")
      .option("--text <text>", "Report text or UTF-8 file path")
      .option("--file <path>", "UTF-8 transcript file")
      .action(
        (opts: {
          channel: "mail" | "chat" | "voice_transcript" | "text";
          job: string;
          text?: string;
          file?: string;
        }) => {
          const source = opts.file ?? opts.text;
          if (!source) throw new Error("pass --text <fixture|path> or --file <path>");
          printJson(
            renderFieldIntakeReport({
              channel: opts.channel,
              jobId: opts.job,
              text: source,
            }),
          );
        },
      );

    field
      .command("interface")
      .description("Field IF report. Photo and audio bytes are refused. No standing bot")
      .requiredOption("--channel <name>", "mail | chat | voice_transcript | text")
      .requiredOption("--job <id>", "Job id")
      .option("--text <text>", "Report text or UTF-8 file path")
      .option("--file <path>", "UTF-8 transcript file")
      .action(
        (opts: {
          channel: "mail" | "chat" | "voice_transcript" | "text";
          job: string;
          text?: string;
          file?: string;
        }) => {
          const source = opts.file ?? opts.text;
          if (!source) throw new Error("pass --text <fixture|path> or --file <path>");
          printJson(
            renderFieldInterfaceReport({
              channel: opts.channel,
              jobId: opts.job,
              text: source,
            }),
          );
        },
      );

    field
      .command("analytics")
      .description("Summarize job time and write an improvement note")
      .requiredOption("--rows <json>", "JSON array of {staffId,minutes,travelMinutes}")
      .action((opts: { rows: string }) => {
        printJson(renderFieldAnalyticsReport(JSON.parse(opts.rows) as never));
      });
  },
};
