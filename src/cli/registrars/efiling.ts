import type { Command } from "commander";
import { evaluateImplementationScore } from "../../lib/efiling/implementation-score.js";

export function registerEfilingCommands(program: Command): void {
  const efiling = program
    .command("efiling")
    .description("Channel-neutral electronic filing score. Not an e-Tax certification.");

  efiling
    .command("score")
    .description("Report mechanism score M1–M13. Does not enable production submission.")
    .option("--json", "JSON output")
    .action((opts: { json?: boolean }) => {
      const score = evaluateImplementationScore();
      if (opts.json) {
        console.log(JSON.stringify(score, null, 2));
      } else {
        console.log(
          `mechanism ${score.passed}/${score.total} · production ${score.productionSubmission} · lane2 certified ${score.lane2Certified}`,
        );
        for (const row of score.items) {
          console.log(`${row.id} ${row.pass ? "pass" : "fail"} ${row.reason}`);
        }
      }
      if (!score.ok) process.exitCode = 1;
    });
}
