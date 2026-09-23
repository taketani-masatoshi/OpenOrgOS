/** JP labor contract module seed validator */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  fixedTermHistoryFileSchema,
  laborContractSourcesFileSchema,
  laborContractsFileSchema,
  minimumWagesFileSchema,
} from "../../../../../../schemas/jp-labor-contract.js";
import { readYamlFile } from "../../../../../../src/lib/utils.js";

export function validateModuleSeeds(seedDir: string): void {
  readYamlFile(join(seedDir, "labor-contracts.yaml.example"), laborContractsFileSchema);
  readYamlFile(join(seedDir, "fixed-term-history.yaml.example"), fixedTermHistoryFileSchema);
  readYamlFile(join(seedDir, "minimum-wages.yaml.example"), minimumWagesFileSchema);
  const sources = readYamlFile(
    join(seedDir, "sources.yaml.example"),
    laborContractSourcesFileSchema
  );
  for (const form of sources.forms) {
    const templatePath = join(seedDir, form.template);
    if (!existsSync(templatePath)) throw new Error(`missing template seed: ${form.template}`);
  }
}
