/** JP patent application module seed validator */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  patentFieldMapFileSchema,
  patentHolidaysFileSchema,
  patentRegistryFileSchema,
  patentSourcesFileSchema,
  patentSpecificationFileSchema,
  type PatentSpecification,
} from "../../../../../../schemas/jp-patent.js";
import { readYamlFile } from "../../../../../../src/lib/utils.js";
import { validatePatentData } from "../cli/validation.js";

const SPECIFICATION_SUFFIX = ".yaml.example";

function loadSeedSpecifications(seedDir: string): Map<string, PatentSpecification> {
  const specDir = join(seedDir, "specifications");
  if (!existsSync(specDir)) return new Map();
  return new Map(
    readdirSync(specDir)
      .filter((file) => file.endsWith(SPECIFICATION_SUFFIX))
      .map((file) => [file.slice(0, -SPECIFICATION_SUFFIX.length), readYamlFile(join(specDir, file), patentSpecificationFileSchema)])
  );
}

export function validateModuleSeeds(seedDir: string): void {
  const registry = readYamlFile(join(seedDir, "patent-registry.yaml.example"), patentRegistryFileSchema);
  const sources = readYamlFile(join(seedDir, "sources.yaml.example"), patentSourcesFileSchema);
  const issues = validatePatentData({
    applications: registry.applications,
    specifications: loadSeedSpecifications(seedDir),
    sources,
    fieldMap: readYamlFile(join(seedDir, "field-map.yaml.example"), patentFieldMapFileSchema),
    holidays: readYamlFile(join(seedDir, "holidays.yaml.example"), patentHolidaysFileSchema),
    missingTemplates: sources.forms.map((f) => f.template).filter((t) => !existsSync(join(seedDir, t))),
  });
  if (issues.length) throw new Error(`jp_patent_application seed invalid:\n${issues.join("\n")}`);
}
