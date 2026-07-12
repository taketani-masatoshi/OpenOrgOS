import { setTenantId } from "../lib/tenant.js";
import {
  formatRehearsalSummary,
  runSchedulingRehearsalCore,
  type SchedulingRehearsalOptions,
} from "../lib/scheduling-coordination/rehearsal.js";

export async function runSchedulingRehearsal(
  opts: SchedulingRehearsalOptions & { tenant?: string }
): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);

  try {
    const result = await runSchedulingRehearsalCore(opts);

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
      return;
    }

    if (opts.setupOnly || !opts.full) {
      if (result.readiness?.ready) {
        console.log("✓ Scheduling rehearsal setup ready");
        console.log(`  next: orgos executive scheduling rehearsal --full --tenant ${opts.tenant ?? process.env.ORGOS_TENANT}`);
      } else {
        console.log("✗ Scheduling rehearsal setup incomplete");
        for (const issue of result.readiness?.issues.filter((i) => i.severity === "error") ?? []) {
          console.log(`  - ${issue.message} (${issue.fix})`);
        }
        process.exit(1);
      }
      return;
    }

    console.log(formatRehearsalSummary(result));
    console.log(`\nsteps: ${result.steps.join(" → ")}`);
    if (!result.ok) process.exit(1);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    } else {
      console.error(message);
    }
    process.exit(1);
  }
}
