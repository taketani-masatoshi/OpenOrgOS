import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpStatutoryMeetingsChecklist,
  runJpStatutoryMeetingsDraft,
  runJpStatutoryMeetingsSchedule,
  runJpStatutoryMeetingsShow,
  runJpStatutoryMeetingsValidate,
} from "./commands.js";

export const MODULE_ID = "jp_statutory_meetings";

const MEETING_OPTION = "--meeting <id>";
const MEETING_OPTION_HELP = "Meeting id from data/governance/meetings.yaml";
const AS_OF_OPTION = "--as-of <date>";
const AS_OF_OPTION_HELP = "Reference date YYYY-MM-DD (default: today)";

function registerStatutoryMeetingsCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("statutory-meetings")
    .description("JP shareholder and board meetings — convocation · minutes (jp_statutory_meetings)");

  cmd
    .command("show")
    .description("Meetings, company governance profile, and official sources")
    .option("--json", "JSON output")
    .action((opts) => runJpStatutoryMeetingsShow({ json: opts.json }));

  cmd
    .command("validate")
    .description("Validate statutory meetings data files")
    .action(() => runJpStatutoryMeetingsValidate());

  cmd
    .command("schedule")
    .description("Convocation deadline · record-date window · omission paths (会社法124・299・300・319・368・370条)")
    .requiredOption(MEETING_OPTION, MEETING_OPTION_HELP)
    .option(AS_OF_OPTION, AS_OF_OPTION_HELP)
    .option("--json", "JSON output")
    .action((opts) => runJpStatutoryMeetingsSchedule({ meeting: opts.meeting, asOf: opts.asOf, json: opts.json }));

  cmd
    .command("checklist")
    .description("Notice timing · resolution requirements · minutes items · retention")
    .requiredOption(MEETING_OPTION, MEETING_OPTION_HELP)
    .option(AS_OF_OPTION, AS_OF_OPTION_HELP)
    .option("--json", "JSON output")
    .action((opts) => runJpStatutoryMeetingsChecklist({ meeting: opts.meeting, asOf: opts.asOf, json: opts.json }));

  cmd
    .command("draft")
    .description("Generate 招集通知 and 議事録 drafts from seed templates")
    .requiredOption(MEETING_OPTION, MEETING_OPTION_HELP)
    .option("--write", "Write files to docs/company/governance/{meeting-id}/")
    .option("--json", "JSON output")
    .action((opts) => runJpStatutoryMeetingsDraft({ meeting: opts.meeting, write: opts.write, json: opts.json }));
}

export const jp_statutory_meetingsCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStatutoryMeetingsCommands(ctx.operationsCmd);
  },
};
