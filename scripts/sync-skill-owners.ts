#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const root = join(import.meta.dirname, "..");
const catalog = YAML.parse(
  readFileSync(join(root, "steward/core/agents/registry.yaml"), "utf-8")
) as {
  agents: Record<string, { id: string; name: string }>;
  aliases?: Record<string, string>;
};

const labels = new Map<string, string>();
for (const agent of Object.values(catalog.agents)) {
  labels.set(agent.id.toLowerCase(), agent.id);
  labels.set(agent.name.toLowerCase(), agent.id);
  labels.set(agent.name.replace(/ Agent$/, "").toLowerCase(), agent.id);
}
for (const alias of Object.keys(catalog.aliases ?? {})) {
  labels.set(alias.toLowerCase(), alias);
  labels.set(alias.replace(/_/g, " ").toLowerCase(), alias);
}
labels.set("executive", "executive_steward");
labels.set("executive steward", "executive_steward");
labels.set("risk & insurance", "risk_insurance");
labels.set("data analytics", "data_analytics");
labels.set("pr", "pr_communications");
labels.set("l&d", "learning_development");
labels.set("corp dev", "corporate_development");
labels.set("quality assurance", "quality_assurance");

const routing = YAML.parse(
  readFileSync(join(root, "steward/core/routing/registry.yaml"), "utf-8")
) as { routes?: Array<{ skill?: string; agent: string }> };
const routeOwners = new Map(
  (routing.routes ?? []).filter((route) => route.skill).map((route) => [route.skill!, route.agent])
);

function registryFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...registryFiles(path));
    else if (name === "registry.yaml" && path.includes(`${join("skills", "registry.yaml")}`))
      out.push(path);
  }
  return out;
}

let changed = 0;
for (const path of registryFiles(join(root, "steward"))) {
  const doc = YAML.parse(readFileSync(path, "utf-8")) as {
    skills?: Array<Record<string, unknown> & { agent?: string; agent_id?: string }>;
  };
  if (!doc.skills) continue;
  let dirty = false;
  for (const skill of doc.skills) {
    const hadLegacyOwner = skill.agent !== undefined;
    const label = String(skill.agent ?? "").toLowerCase();
    const id = routeOwners.get(String(skill.id)) ?? skill.agent_id ?? labels.get(label);
    if (!id) throw new Error(`${path}: unknown skill owner ${skill.agent}`);
    if (skill.agent_id !== id) {
      skill.agent_id = id;
      dirty = true;
    }
    delete skill.agent;
    if (hadLegacyOwner) dirty = true;
  }
  if (dirty) {
    writeFileSync(path, YAML.stringify(doc, { lineWidth: 120 }), "utf-8");
    changed++;
  }
}
console.log(`Updated ${changed} skill registries`);
