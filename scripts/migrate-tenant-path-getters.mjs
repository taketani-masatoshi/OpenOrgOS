#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const REPLACEMENTS = [
  ["DOCS_LODGING_PDF_DIR", "getDocsLodgingPdfDir()"],
  ["DOCS_CORPORATE_PDF_DIR", "getDocsCorporatePdfDir()"],
  ["DOCS_OUTBOX_DIR", "getDocsOutboxDir()"],
  ["DOCS_INBOX_DIR", "getDocsInboxDir()"],
  ["DOCS_REPORTS_DIR", "getDocsReportsDir()"],
  ["CLASSIFICATION_REGISTRY_YAML", "getClassificationRegistryYaml()"],
  ["BANK_ACCOUNTS_YAML", "getBankAccountsYaml()"],
  ["STAKEHOLDERS_DOCS_DIR", "getStakeholdersDocsDir()"],
  ["STAKEHOLDERS_YAML", "getStakeholdersYaml()"],
  ["EXECUTIVE_DIR", "getExecutiveDir()"],
  ["DATA_DIR", "getDataDir()"],
  ["DOCS_DIR", "getDocsDir()"],
];

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
  for (const [from, to] of REPLACEMENTS) {
    text = text.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }
  const used = GETTERS.filter((g) => text.includes(g));
  if (used.length && text.includes('from "./utils.js"') || text.includes('from "../lib/utils.js"')) {
    text = text.replace(
      /import \{([^}]+)\} from "(\.\.?\/(?:lib\/)?utils\.js)";/,
      (_m, imports, path) => {
        const names = imports
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const g of used) {
          if (!names.includes(g)) names.push(g);
        }
        return `import { ${names.join(", ")} } from "${path}";`;
      }
    );
  }
  writeFileSync(file, text);
  console.log(file);
}
