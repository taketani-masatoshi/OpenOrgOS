import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import {
  runVenueCancel,
  runVenueCatalog,
  runVenueConfirm,
  runVenueLinkCase,
  runVenueList,
  runVenueProviders,
  runVenueReserve,
  runVenueSearch,
  runVenueShow,
  runVenueSuggest,
  runVenueApplySuggest,
} from "./commands.js";

export const MODULE_ID = "venue_booking";

function registerVenueCommands(operationsCmd: Command): void {
  const venueCmd = operationsCmd
    .command("venue")
    .description(
      "Venue web booking — channel venue_booking (NOT Wire) · deep-link / API adapters"
    );

  venueCmd
    .command("providers")
    .description("List venue booking providers / wired adapters")
    .option("--json", "JSON output")
    .action((opts) => runVenueProviders({ json: opts.json }));

  venueCmd
    .command("catalog")
    .description("List tenant venue catalog (VENUE-*)")
    .option("--json", "JSON output")
    .action((opts) => runVenueCatalog({ json: opts.json }));

  venueCmd
    .command("suggest")
    .description(
      "Suggest venues by party office/home-commute stations (L1 anchors · no street address)"
    )
    .option("--case <SCH-YYYY-NNN>", "Scheduling case (match counterparty anchors)")
    .option("--timing <day|evening>", "Weight office vs home_commute")
    .option("--limit <n>", "Max suggestions", (v) => parseInt(v, 10), 3)
    .option("--json", "JSON output")
    .action((opts) =>
      runVenueSuggest({
        caseId: opts.case,
        timing: opts.timing,
        limit: opts.limit,
        json: opts.json,
      })
    );

  venueCmd
    .command("apply-suggest")
    .description(
      "CEO-approved: write top-3 suggest venues onto case as venue_options (before clarify send)"
    )
    .requiredOption("--case <SCH-YYYY-NNN>", "Scheduling case")
    .option("--timing <day|evening>", "Weight office vs home_commute")
    .option(
      "--allow-after-clarify",
      "Allow overriding first pick after clarify already sent"
    )
    .option("--json", "JSON output")
    .action((opts) =>
      runVenueApplySuggest({
        caseId: opts.case,
        timing: opts.timing,
        allowAfterClarifySent: Boolean(opts.allowAfterClarify),
        json: opts.json,
      })
    );

  venueCmd
    .command("search")
    .description("Check availability / generate search deep-link (no scrape)")
    .option("--venue <id-or-name>", "Catalog VENUE-001 or name")
    .option("--venue-name <name>", "Venue display name")
    .option("--area <text>", "Area / station")
    .option("--provider <id>", "manual | hotpepper_deep_link | tabelog_deep_link")
    .option("--party-size <n>", "Party size", (v) => parseInt(v, 10))
    .option("--start-at <ISO>", "Start datetime")
    .option("--json", "JSON output")
    .action(async (opts) => {
      await runVenueSearch({
        venue: opts.venue,
        venueName: opts.venueName,
        area: opts.area,
        provider: opts.provider,
        partySize: opts.partySize,
        startAt: opts.startAt,
        json: opts.json,
      });
    });

  venueCmd
    .command("reserve")
    .description("Create VR-* hold / pending_manual ticket (idempotent --request-id)")
    .option("--venue <id-or-name>", "Catalog VENUE-001 or name")
    .option("--venue-name <name>", "Venue display name")
    .option("--area <text>", "Area / station")
    .option("--provider <id>", "manual | hotpepper_deep_link | tabelog_deep_link")
    .option("--party-size <n>", "Party size", (v) => parseInt(v, 10))
    .option("--start-at <ISO>", "Start datetime")
    .option("--end-at <ISO>", "End datetime")
    .option("--budget <yen>", "Budget per person JPY", (v) => parseInt(v, 10))
    .option("--cuisine <text>", "Cuisine hint")
    .option("--notes <text>", "Notes")
    .option("--case <SCH-YYYY-NNN>", "Link scheduling case")
    .option("--request-id <id>", "Idempotency key")
    .option("--json", "JSON output")
    .action(async (opts) => {
      await runVenueReserve({
        venue: opts.venue,
        venueName: opts.venueName,
        area: opts.area,
        provider: opts.provider,
        partySize: opts.partySize,
        startAt: opts.startAt,
        endAt: opts.endAt,
        budget: opts.budget,
        cuisine: opts.cuisine,
        notes: opts.notes,
        caseId: opts.case,
        requestId: opts.requestId,
        json: opts.json,
      });
    });

  venueCmd
    .command("confirm")
    .description("Confirm after human/API booking — requires approved APR or --allow-unapproved")
    .requiredOption("--id <VR-YYYY-NNN>", "Reservation id")
    .option("--external-ref <ref>", "Provider booking number")
    .option("--approval-id <APR-…>", "Approved internal org approval")
    .option("--allow-unapproved", "Demo only — skip CEO approval gate")
    .option(
      "--allow-measurement-ref",
      "Demo only — allow LIVE-MEASURE / DEMO-ONLY / TEST-REF / HP-PROOF / REH- / PROOF- as external_ref"
    )
    .option("--json", "JSON output")
    .action(async (opts) => {
      await runVenueConfirm({
        id: opts.id,
        externalRef: opts.externalRef,
        approvalId: opts.approvalId,
        allowUnapproved: opts.allowUnapproved,
        allowMeasurementRef: opts.allowMeasurementRef,
        json: opts.json,
      });
    });

  venueCmd
    .command("cancel")
    .description("Cancel ledger row (provider cancel may be manual)")
    .requiredOption("--id <VR-YYYY-NNN>", "Reservation id")
    .option("--json", "JSON output")
    .action(async (opts) => {
      await runVenueCancel({ id: opts.id, json: opts.json });
    });

  venueCmd
    .command("list")
    .description("List venue reservations")
    .option("--status <status>", "Filter status")
    .option("--json", "JSON output")
    .action((opts) => runVenueList({ status: opts.status, json: opts.json }));

  venueCmd
    .command("show")
    .description("Show one reservation")
    .requiredOption("--id <VR-YYYY-NNN>", "Reservation id")
    .option("--json", "JSON output")
    .action((opts) => runVenueShow({ id: opts.id, json: opts.json }));

  venueCmd
    .command("link-case")
    .description("Attach VR-* to scheduling case SCH-*")
    .requiredOption("--id <VR-YYYY-NNN>", "Reservation id")
    .requiredOption("--case <SCH-YYYY-NNN>", "Scheduling case id")
    .option("--json", "JSON output")
    .action((opts) =>
      runVenueLinkCase({ id: opts.id, caseId: opts.case, json: opts.json })
    );
}


function runVenueListSkill(opts: SkillRunOptions): void {
  runVenueList({ json: Boolean(opts.json) });
}

function runVenueCatalogSkill(opts: SkillRunOptions): void {
  runVenueCatalog({ json: Boolean(opts.json) });
}

export const venueBookingCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerVenueCommands(ctx.operationsCmd);
  },
  skillHandlers: {
    venue_list: runVenueListSkill,
    venue_catalog: runVenueCatalogSkill,
  },
};
