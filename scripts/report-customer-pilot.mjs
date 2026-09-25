import { readFileSync } from "node:fs";
import { summarizeCustomerPilot } from "./lib/customer-pilot-metrics.mjs";

try {
  if (process.argv.length !== 3)
    throw new Error("Usage: npm run product:pilot-report -- /path/to/observations.json");
  console.log(
    JSON.stringify(
      summarizeCustomerPilot(JSON.parse(readFileSync(process.argv[2], "utf8"))),
      null,
      2
    )
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Pilot measurement failed");
  process.exitCode = 1;
}
