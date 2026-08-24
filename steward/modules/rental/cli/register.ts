import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { runRentalRentRoll, runRentalShow, runRentalValidate, MODULE_ID } from "./commands.js";

export { MODULE_ID };

export const rentalCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("rental")
      .description("Rental — rent roll · NOI metrics (rental module)");

    cmd
      .command("show")
      .description("Rental module status summary")
      .option("--json", "JSON output")
      .action((opts: { json?: boolean }) => runRentalShow({ json: Boolean(opts.json) }));

    cmd.command("validate").description("Validate module catalog seeds").action(() => {
      runRentalValidate();
    });

    cmd
      .command("rent-roll")
      .description("Rent roll with NOI metrics from property-revenue.yaml")
      .option("--property <id>", "Filter by property id")
      .option("--json", "JSON output")
      .action((opts: { property?: string; json?: boolean }) =>
        runRentalRentRoll({ propertyId: opts.property, json: Boolean(opts.json) }),
      );
  },
  skillHandlers: {
    rental_rent_roll: (opts) =>
      runRentalRentRoll({ propertyId: opts.id, json: Boolean(opts.json) }),
    rental_show: (opts) => runRentalShow({ json: Boolean(opts.json) }),
  },
};
