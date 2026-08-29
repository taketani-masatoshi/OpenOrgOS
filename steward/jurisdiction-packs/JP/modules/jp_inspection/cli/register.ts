import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../../../src/commands/skills.js";
import {
  completeInspection,
  listSatisfiedInspectionTypeIds,
  loadInspectionRegistry,
  loadInspectionTypes,
  scheduleInspection,
} from "../../../../../../src/lib/inspection-workflow.js";
import { listPermitOpeningBlockers } from "../../../../../../src/lib/permit-opening-gate.js";

export const MODULE_ID = "jp_inspection";


function runInspectionListSkill(opts: SkillRunOptions): void {
  const { data } = loadInspectionRegistry();
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`# Inspections (${data.inspections.length})\n`);
  for (const i of data.inspections) {
    console.log(`- ${i.id} · ${i.inspection_type_id} · ${i.status}`);
  }
  if (!data.inspections.length) console.log("（なし）");
}

function runInspectionTypesSkill(opts: SkillRunOptions): void {
  const data = loadInspectionTypes();
  if (!data) {
    console.error("inspection-types not found");
    process.exitCode = 1;
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`# Inspection types (${data.types.length})\n`);
  for (const t of data.types) console.log(`- \`${t.id}\` — ${t.name_ja}`);
}

export const jp_inspectionCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("inspection")
      .description("Inspection Fulfilment — schedule/complete/gate");

    cmd
      .command("types")
      .option("--json")
      .action((opts: { json?: boolean }) => {
        const data = loadInspectionTypes();
        if (!data) {
          console.error("inspection-types not found");
          process.exitCode = 1;
          return;
        }
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        console.log(`# Inspection types (${data.types.length})\n`);
        for (const t of data.types) console.log(`- \`${t.id}\` — ${t.name_ja}`);
      });

    cmd
      .command("list")
      .option("--json")
      .action((opts: { json?: boolean }) => {
        const { data } = loadInspectionRegistry();
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        console.log(`# Inspections (${data.inspections.length})\n`);
        for (const i of data.inspections) {
          console.log(`- ${i.id} · ${i.inspection_type_id} · ${i.status}`);
        }
        if (!data.inspections.length) console.log("（なし）");
      });

    cmd
      .command("schedule")
      .description("Schedule an inspection")
      .requiredOption("--type <insp_type_id>")
      .requiredOption("--scheduled-on <YYYY-MM-DD>")
      .option("--property <PROP-xxx>")
      .option("--related-permit <PER-…>")
      .option("--notes <text>")
      .option("--write")
      .option("--json")
      .action((opts) => {
        try {
          const r = scheduleInspection({
            type: opts.type,
            scheduledOn: opts.scheduledOn,
            propertyId: opts.property,
            relatedPermitId: opts.relatedPermit,
            notes: opts.notes,
            write: opts.write,
          });
          if (opts.json) {
            console.log(JSON.stringify(r, null, 2));
            return;
          }
          console.log(`# Inspection schedule — ${r.inspection.id} · ${r.inspection.status}`);
          if (r.event_id) console.log(`event: ${r.event_id}`);
          if (!opts.write) console.log("\n`--write` で保存");
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
      });

    cmd
      .command("complete")
      .description("Record inspection result")
      .requiredOption("--id <INSP-…>")
      .requiredOption("--result <passed|failed|corrected>")
      .option("--completed-on <YYYY-MM-DD>")
      .option("--evidence <path>")
      .option("--write")
      .option("--json")
      .action((opts) => {
        const result = opts.result as "passed" | "failed" | "corrected";
        if (!["passed", "failed", "corrected"].includes(result)) {
          console.error("--result must be passed|failed|corrected");
          process.exit(1);
        }
        try {
          const r = completeInspection({
            id: opts.id,
            result,
            completedOn: opts.completedOn,
            evidence: opts.evidence,
            write: opts.write,
          });
          if (opts.json) {
            console.log(JSON.stringify(r, null, 2));
            return;
          }
          console.log(`# Inspection complete — ${r.inspection.id} · ${r.inspection.status}`);
          if (r.event_id) console.log(`event: ${r.event_id}`);
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
      });

    cmd
      .command("gate")
      .description("Show inspection fulfilment blockers")
      .option("--json")
      .action((opts: { json?: boolean }) => {
        const blockers = listPermitOpeningBlockers().filter(
          (b) => b.fulfilment === "inspection"
        );
        if (opts.json) {
          console.log(
            JSON.stringify(
              { blockers, satisfied: [...listSatisfiedInspectionTypeIds()] },
              null,
              2
            )
          );
          return;
        }
        console.log("# Inspection gate\n");
        if (!blockers.length) {
          console.log("✓ 検査ブロッカーなし");
          return;
        }
        for (const b of blockers) {
          console.log(`- ${b.title}`);
          console.log(`  ${b.detail}`);
        }
        process.exitCode = 1;
      });
  },
  skillHandlers: {
    jp_inspection_list: runInspectionListSkill,
    jp_inspection_types: runInspectionTypesSkill,
  },
};
