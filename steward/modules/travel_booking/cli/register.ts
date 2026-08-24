import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import {
  runTravelCheck,
  runTravelDraft,
  runTravelIntake,
  runTravelPortals,
} from "./commands.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";

export const MODULE_ID = "travel_booking";

function registerTravelCommands(operationsCmd: Command): void {
  const travelCmd = operationsCmd
    .command("travel")
    .description("Travel booking — REG-008 · draft MD (travel_booking module)");

  travelCmd
    .command("portals")
    .description("List travel portal definitions")
    .option("--json", "JSON output")
    .action((opts) => runTravelPortals({ json: opts.json }));

  travelCmd
    .command("intake")
    .description("Validate Step 0 hearing fields (exit 1 if incomplete — browser forbidden)")
    .option("--portal <id>", "rakuten-travel | booking-com | trip-com")
    .option("--trip-type <type>", "hotel | flight | shinkansen | package")
    .option("--destination <text>", "Destination city/region")
    .option("--area <text>", "Station · venue · neighborhood")
    .option("--check-in <YYYY-MM-DD>", "Check-in date")
    .option("--check-out <YYYY-MM-DD>", "Check-out date")
    .option("--guests <n>", "Guest count", parseInt)
    .option("--budget <yen>", "Max per night (JPY)", parseInt)
    .option("--purpose <text>", "Business purpose (one line)")
    .option("--room <text>", "Room preference")
    .option("--role <role>", "executive | employee", "executive")
    .option("--slug <slug>", "Draft filename slug")
    .option("--file <path>", "YAML request file (merged with flags)")
    .option("--json", "JSON output")
    .action((opts) =>
      runTravelIntake({
        portal: opts.portal,
        tripType: opts.tripType,
        destination: opts.destination,
        area: opts.area,
        checkIn: opts.checkIn,
        checkOut: opts.checkOut,
        guests: opts.guests,
        budget: opts.budget,
        purpose: opts.purpose,
        room: opts.room,
        role: opts.role,
        slug: opts.slug,
        file: opts.file,
        json: opts.json,
      })
    );

  travelCmd
    .command("check")
    .description("REG-008 lodging limit check")
    .option("--budget <yen>", "Budget per night (JPY)", parseInt)
    .option("--role <role>", "executive | employee", "executive")
    .option("--trip-type <type>", "hotel | flight | shinkansen | package")
    .option("--flight-pre-approved", "Flight pre-approved flag")
    .option("--json", "JSON output")
    .action((opts) =>
      runTravelCheck({
        budget: opts.budget,
        role: opts.role,
        tripType: opts.tripType,
        flightPreApproved: opts.flightPreApproved,
        json: opts.json,
      })
    );

  travelCmd
    .command("draft")
    .description("Generate travel draft markdown (skeleton · browser fills candidates)")
    .option("--portal <id>", "rakuten-travel | booking-com | trip-com")
    .option("--trip-type <type>", "hotel | flight | shinkansen | package")
    .option("--destination <text>", "Destination city/region")
    .option("--area <text>", "Station · venue · neighborhood")
    .option("--check-in <YYYY-MM-DD>", "Check-in date")
    .option("--check-out <YYYY-MM-DD>", "Check-out date")
    .option("--guests <n>", "Guest count", parseInt)
    .option("--budget <yen>", "Max per night (JPY)", parseInt)
    .option("--purpose <text>", "Business purpose")
    .option("--room <text>", "Room preference")
    .option("--role <role>", "executive | employee", "executive")
    .option("--slug <slug>", "Draft filename slug")
    .option("--file <path>", "YAML request file")
    .option("--write", "Write to docs/operations/travel-drafts/ (gitignore)")
    .option("--dry-run", "Set status dry-run in draft header")
    .option("--no-print", "Do not print draft to stdout")
    .action((opts) =>
      runTravelDraft({
        portal: opts.portal,
        tripType: opts.tripType,
        destination: opts.destination,
        area: opts.area,
        checkIn: opts.checkIn,
        checkOut: opts.checkOut,
        guests: opts.guests,
        budget: opts.budget,
        purpose: opts.purpose,
        room: opts.room,
        role: opts.role,
        slug: opts.slug,
        file: opts.file,
        write: opts.write,
        dryRun: opts.dryRun,
        print: opts.print,
      })
    );
}

export const travelBookingCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerTravelCommands(ctx.operationsCmd);
  },
  skillHandlers: {
    travel_policy_check: (opts) =>
      runTravelCheck({
        budget: opts.budget,
        role: opts.role,
        tripType: opts.tripType,
        flightPreApproved: opts.flightPreApproved,
        json: opts.json,
      }),
    travel_intake_validate: (opts) =>
      runTravelIntake({
        portal: opts.portal,
        tripType: opts.tripType,
        destination: opts.destination,
        area: opts.area,
        checkIn: opts.checkIn,
        checkOut: opts.checkOut,
        guests: opts.guests,
        budget: opts.budget,
        purpose: opts.purpose,
        room: opts.room,
        role: opts.role,
        slug: opts.slug,
        file: opts.file,
        json: opts.json,
      }),
  },
};
