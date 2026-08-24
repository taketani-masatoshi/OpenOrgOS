#!/usr/bin/env node
/**
 * Parse all GitHub Actions workflow files so YAML syntax errors fail locally
 * before they produce zero-job startup failures on GitHub.
 */
import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const workflowsDir = join(process.cwd(), ".github", "workflows");

async function main() {
  let entries;
  try {
    entries = await readdir(workflowsDir);
  } catch (err) {
    console.error(`lint:workflows: cannot read ${workflowsDir}:`, err);
    process.exit(1);
  }

  const yamlFiles = entries.filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
  if (yamlFiles.length === 0) {
    console.error("lint:workflows: no workflow files found");
    process.exit(1);
  }

  let failed = false;
  for (const name of yamlFiles.sort()) {
    const path = join(workflowsDir, name);
    const text = await readFile(path, "utf8");
    const result = spawnSync(
      "python3",
      [
        "-c",
        "import sys, yaml; yaml.safe_load(open(sys.argv[1]))",
        path,
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      failed = true;
      console.error(`lint:workflows: invalid YAML in ${path}`);
      if (result.stderr) console.error(result.stderr.trim());
    } else {
      console.log(`lint:workflows: ok ${name}`);
    }
  }

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("lint:workflows:", err);
  process.exit(1);
});
