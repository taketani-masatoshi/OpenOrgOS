#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { buildGeneratedAgentIdsSource } from "../src/lib/generated-artifacts.js";

const root = join(import.meta.dirname, "..");
const registryPath = join(root, "steward/core/agents/registry.yaml");
const outputPath = join(root, "schemas/generated/agent-ids.ts");
const registry = YAML.parse(readFileSync(registryPath, "utf-8")) as {
  agents: Record<string, { id: string }>;
  aliases?: Record<string, string>;
};

const ids = Object.values(registry.agents).map((agent) => agent.id);
const aliases = registry.aliases ?? {};
const source = buildGeneratedAgentIdsSource(root);

if (process.argv.includes("--check")) {
  if (!existsSync(outputPath) || readFileSync(outputPath, "utf-8") !== source) {
    console.error(`Stale ${outputPath}; run npm run agent:catalog:sync`);
    process.exitCode = 1;
  } else {
    console.log(`Current ${outputPath} (${ids.length} agents, ${Object.keys(aliases).length} aliases)`);
  }
} else {
  writeFileSync(outputPath, source, "utf-8");
  console.log(`Wrote ${outputPath} (${ids.length} agents, ${Object.keys(aliases).length} aliases)`);
}
