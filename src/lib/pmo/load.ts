import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  pmoPortfolioFileSchema,
  pmoProjectSchema,
  type PmoPortfolioFile,
  type PmoProject,
} from "../../../schemas/projects/index.js";
import { getDataDir, listYamlFiles, readYamlFile } from "../utils.js";

export const PMO_DIR_REL = "data/projects";
export const PMO_PORTFOLIO_REL = "data/projects/portfolio.yaml";

export interface PmoSchemaIssue {
  file: string;
  message: string;
}

export interface LoadedPmo {
  present: boolean;
  portfolio: PmoPortfolioFile | null;
  projects: PmoProject[];
  unexpectedFiles: string[];
}

export function getPmoDir(): string {
  return join(getDataDir(), "projects");
}

function yamlFilesInPmoDir(): string[] {
  const dir = getPmoDir();
  if (!existsSync(dir)) return [];
  return listYamlFiles(dir);
}

/** True when the tenant has PMO YAML (README-only scaffold does not count). */
export function pmoDirExists(): boolean {
  return yamlFilesInPmoDir().length > 0;
}

function isProjectFileName(name: string): boolean {
  return /^PRJ-[A-Z0-9-]+\.ya?ml$/.test(name);
}

export function loadPmoPortfolio(): LoadedPmo {
  const yamlFiles = yamlFilesInPmoDir();
  if (yamlFiles.length === 0) {
    return { present: false, portfolio: null, projects: [], unexpectedFiles: [] };
  }

  const unexpectedFiles: string[] = [];
  let portfolio: PmoPortfolioFile | null = null;
  const projects: PmoProject[] = [];

  for (const abs of yamlFiles) {
    const name = basename(abs);
    if (name === "portfolio.yaml" || name === "portfolio.yml") {
      portfolio = readYamlFile(abs, pmoPortfolioFileSchema);
      continue;
    }
    if (isProjectFileName(name)) {
      projects.push(readYamlFile(abs, pmoProjectSchema));
      continue;
    }
    unexpectedFiles.push(`${PMO_DIR_REL}/${name}`);
  }

  return { present: true, portfolio, projects, unexpectedFiles };
}

/** Schema + filename checks for `orgos validate` (optional when dir is absent). */
export function collectPmoSchemaErrors(): PmoSchemaIssue[] {
  const yamlFiles = yamlFilesInPmoDir();
  if (yamlFiles.length === 0) return [];

  const errors: PmoSchemaIssue[] = [];
  const hasPortfolio = yamlFiles.some((f) => {
    const name = basename(f);
    return name === "portfolio.yaml" || name === "portfolio.yml";
  });
  if (!hasPortfolio) {
    errors.push({
      file: PMO_PORTFOLIO_REL,
      message: "data/projects/ exists but portfolio.yaml is missing",
    });
  }

  for (const abs of yamlFiles) {
    const name = basename(abs);
    const rel = `${PMO_DIR_REL}/${name}`;
    try {
      if (name === "portfolio.yaml" || name === "portfolio.yml") {
        readYamlFile(abs, pmoPortfolioFileSchema);
        continue;
      }
      if (isProjectFileName(name)) {
        const project = readYamlFile(abs, pmoProjectSchema);
        const stem = name.replace(/\.ya?ml$/, "");
        if (project.id !== stem) {
          errors.push({
            file: rel,
            message: `file name ${stem} does not match id ${project.id}`,
          });
        }
        continue;
      }
      errors.push({
        file: rel,
        message: "unexpected YAML — use portfolio.yaml or PRJ-*.yaml only",
      });
    } catch (e) {
      errors.push({
        file: rel,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return errors;
}
