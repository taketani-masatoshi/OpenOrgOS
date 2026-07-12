import {
  buildCliCommandCatalog,
  summarizeCliCommandCatalog,
  validateCliCommandCatalog,
} from "../lib/cli-command-catalog.js";
import { buildOrgOsCommandProgram } from "../lib/cli-program.js";

export interface PlatformCliCatalogOptions {
  json?: boolean;
}

export function runPlatformCliCatalog(opts: PlatformCliCatalogOptions = {}): void {
  const entries = buildCliCommandCatalog(buildOrgOsCommandProgram());
  const issues = validateCliCommandCatalog(entries);
  const summary = summarizeCliCommandCatalog(entries);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: issues.length === 0,
          summary,
          issues,
          commands: entries,
        },
        null,
        2
      )
    );
    if (issues.length > 0) process.exit(1);
    return;
  }

  console.log("# OrgOS CLI Catalog", "");
  console.log(`- commands: ${summary.total}`);
  console.log(`- wire facade: ${summary.wireFacadeCommands}`);
  console.log(`- legacy roots: ${summary.legacyRoots.join(", ") || "—"}`);
  if (issues.length) {
    console.log("", "**Issues:**");
    for (const issue of issues) console.log(`- ${issue}`);
    process.exit(1);
  }
  console.log("", "**Result:** OK");
}
