import { agentId } from "../../schemas/classification.js";
import {
  buildHandoff,
  formatHandoffMarkdown,
  formatSuggestCard,
  loadHandoff,
  loadRoutingRegistry,
  matchRoutes,
  pickBestRoute,
  validateRoutingRegistry,
  writeHandoffFiles,
} from "../lib/routing.js";
import { resolveSkillDispatch } from "./skills.js";
import { formatWorkOrderMarkdown } from "../lib/escalate.js";
import { executeRouteHandoff } from "../lib/route-execution.js";

export function runRouteList(): void {
  const issues = validateRoutingRegistry();
  if (issues.length) {
    console.warn("Routing registry warnings:");
    for (const i of issues) console.warn(`  ${i}`);
  }

  const registry = loadRoutingRegistry();
  console.log(`Routing registry · v${registry.version}\n`);
  console.log("| id | agent | skill | priority | boundary |");
  console.log("|----|-------|-------|----------|----------|");
  for (const route of registry.routes) {
    console.log(
      `| ${route.id} | ${route.agent} | ${route.skill ?? "—"} | ${route.priority} | ${route.boundary} |`
    );
  }
  console.log(`\n${registry.routes.length} routes · steward/core/routing/registry.yaml`);
  console.log("例: npm run orgos -- route match --text \"契約期限\"");
}

export interface RouteMatchOptions {
  text?: string;
  path?: string;
  json?: boolean;
}

export function runRouteMatch(opts: RouteMatchOptions): void {
  if (!opts.text && !opts.path) {
    console.error("Provide --text and/or --path");
    process.exit(1);
  }

  const matches = matchRoutes({ text: opts.text, path: opts.path });

  if (opts.json) {
    console.log(
      JSON.stringify(
        matches.map((m) => ({
          id: m.route.id,
          agent: m.route.agent,
          skill: m.route.skill,
          score: m.score,
          matchedBy: m.matchedBy,
          access: m.access,
          moduleEnabled: m.moduleEnabled,
          boundaryOk: m.boundaryOk,
          skillAvailable: m.skillAvailable,
          eligible: m.access.allowed && m.moduleEnabled && m.boundaryOk,
        })),
        null,
        2
      )
    );
    return;
  }

  if (matches.length === 0) {
    console.log("No route matches.");
    return;
  }

  console.log("| id | agent | score | eligible | matched |");
  console.log("|----|-------|-------|----------|---------|");
  for (const m of matches) {
    const eligible = m.access.allowed && m.moduleEnabled && m.boundaryOk ? "yes" : "no";
    console.log(
      `| ${m.route.id} | ${m.route.agent} | ${m.score} | ${eligible} | ${m.matchedBy.join(", ")} |`
    );
  }
}

export interface RouteSuggestOptions {
  from?: string;
  to?: string;
  skill?: string;
  text?: string;
  path?: string;
  routeId?: string;
  mode?: "suggest" | "auto";
  json?: boolean;
}

export function runRouteSuggest(opts: RouteSuggestOptions): void {
  let matched = opts.text || opts.path ? pickBestRoute({ text: opts.text, path: opts.path }) : undefined;

  if (opts.routeId && !matched) {
    matched = matchRoutes({ text: opts.text, path: opts.path }).find((m) => m.route.id === opts.routeId);
  }

  const parsedTo = opts.to ? agentId.safeParse(opts.to) : null;
  if (opts.to && !parsedTo?.success) {
    console.error(`Unknown agent: ${opts.to}`);
    process.exit(1);
  }

  const handoff = buildHandoff(
    {
      fromAgent: opts.from,
      toAgent: parsedTo?.success ? parsedTo.data : undefined,
      skill: opts.skill,
      routeId: opts.routeId,
      mode: opts.mode ?? "suggest",
      text: opts.text,
      path: opts.path,
    },
    matched
  );

  if (opts.json) {
    console.log(JSON.stringify({ handoff, matched: matched ?? null }, null, 2));
    return;
  }

  console.log(formatSuggestCard(handoff, matched));
  if (!handoff.access.allowed) process.exit(1);
}

export interface RouteHandoffOptions {
  from?: string;
  to?: string;
  skill?: string;
  text?: string;
  path?: string;
  routeId?: string;
  mode?: "suggest" | "auto";
  notes?: string;
}

export function runRouteHandoff(opts: RouteHandoffOptions): void {
  let matched = opts.text || opts.path ? pickBestRoute({ text: opts.text, path: opts.path }) : undefined;
  if (opts.routeId && !matched) {
    matched = matchRoutes({ text: opts.text, path: opts.path }).find((m) => m.route.id === opts.routeId);
  }

  const parsedTo = opts.to ? agentId.safeParse(opts.to) : null;
  if (opts.to && !parsedTo?.success) {
    console.error(`Unknown agent: ${opts.to}`);
    process.exit(1);
  }

  const handoff = buildHandoff(
    {
      fromAgent: opts.from ?? "steward",
      toAgent: parsedTo?.success ? parsedTo.data : undefined,
      skill: opts.skill,
      routeId: opts.routeId,
      mode: opts.mode ?? "suggest",
      text: opts.text,
      path: opts.path,
      notes: opts.notes,
    },
    matched
  );

  const { yamlPath, mdPath } = writeHandoffFiles(handoff, matched);
  console.log(`✓ ${yamlPath}`);
  console.log(`✓ ${mdPath}`);
  if (!handoff.access.allowed) process.exit(1);
}

export interface RouteDispatchOptions {
  id: string;
  mode?: "suggest" | "auto" | "implement";
}

export async function runRouteDispatch(opts: RouteDispatchOptions): Promise<void> {
  const handoff = loadHandoff(opts.id);
  const mode = opts.mode ?? handoff.mode ?? "suggest";

  if (mode === "suggest") {
    console.log(formatSuggestCard(handoff));
    console.log("\n" + (handoff.task_type === "implement" ? formatWorkOrderMarkdown(handoff) : formatHandoffMarkdown(handoff)));
    if (handoff.agent_prompt_path) {
      console.log(`\nPrompt: docs/reports/routing-queue/${handoff.agent_prompt_path}`);
    }
    return;
  }

  const outcome = await executeRouteHandoff(
    handoff,
    mode,
    resolveSkillDispatch
  );
  if (outcome.action !== "noop") {
    writeHandoffFiles(outcome.handoff, undefined, { audit: false });
  }

  if (outcome.action === "noop") {
    console.log(`✓ already dispatched ${handoff.id}`);
    return;
  }

  if (outcome.action === "direct_skill") {
    const argv = outcome.handoff.invocation?.argv;
    if (argv) console.log(`→ ${argv.join(" ")}`);
    console.log(`✓ dispatched ${handoff.id}`);
    return;
  }

  if (outcome.action === "work_order") {
    console.log(formatSuggestCard(outcome.handoff));
    console.log(
      "\n" +
        (outcome.handoff.task_type === "implement"
          ? formatWorkOrderMarkdown(outcome.handoff)
          : formatHandoffMarkdown(outcome.handoff))
    );
    console.log(`\nWork Order required: ${outcome.message}`);
    return;
  }

  if (outcome.action === "human_approval") {
    console.error(`Human approval required: ${outcome.message}`);
    return;
  }

  if (outcome.action === "failed") {
    throw new Error(`Skill dispatch failed: ${outcome.message}`);
  }

  console.error(`Auto dispatch ${outcome.action}: ${outcome.message}`);
}
