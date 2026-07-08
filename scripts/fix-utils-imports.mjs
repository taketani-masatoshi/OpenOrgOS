#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const GETTERS = [
  "getDataDir",
  "getDocsDir",
  "getExecutiveDir",
  "getStakeholdersYaml",
  "getStakeholdersDocsDir",
  "getBankAccountsYaml",
  "getClassificationRegistryYaml",
  "getDocsReportsDir",
  "getDocsInboxDir",
  "getDocsOutboxDir",
  "getDocsCorporatePdfDir",
  "getDocsLodgingPdfDir",
];

const files = process.argv.slice(2);
for (const file of files) {
  let text = readFileSync(file, "utf-8");
  text = text.replace(/import \{([^}]+)\} from "([^"]+utils\.js)";/g, (_m, imports, path) => {
    const names = new Set(
      imports
        .split(",")
        .map((s) => s.trim().replace(/\(\)$/, ""))
        .filter(Boolean)
    );
    return `import { ${[...names].join(", ")} } from "${path}";`;
  });
  writeFileSync(file, text);
  console.log(file);
}
