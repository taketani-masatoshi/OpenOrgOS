import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { buildCliCommandCatalog } from "../src/lib/cli-command-catalog.js";
import { buildOrgOsCommandProgram } from "../src/lib/cli-program.js";

const AGENT_INFRA_ROOTS = [
  "agent",
  "orchestrate",
  "llm",
  "mcp",
  "pmo",
  "executive",
  "notifications",
] as const;

function command(parent: Command, name: string): Command {
  const found = parent.commands.find((candidate) => candidate.name() === name);
  if (!found) throw new Error(`missing command: ${parent.name()} ${name}`);
  return found;
}

function optionLongs(cmd: Command): string[] {
  return cmd.options.map((option) => option.long).filter((long): long is string => Boolean(long)).sort();
}

function childNames(cmd: Command): string[] {
  return cmd.commands.map((item) => item.name()).sort();
}

function snapshotRoot(program: Command, root: string): {
  name: string;
  children: string[];
  options: string[];
  nested: Record<string, { children: string[]; options: string[] }>;
} {
  const rootCmd = command(program, root);
  const nested: Record<string, { children: string[]; options: string[] }> = {};
  for (const child of rootCmd.commands) {
    nested[child.name()] = {
      children: childNames(child),
      options: optionLongs(child),
    };
  }
  return {
    name: root,
    children: childNames(rootCmd),
    options: optionLongs(rootCmd),
    nested,
  };
}

describe("Agent infra CLI surface contract", () => {
  it("exposes agent / orchestrate / llm / mcp / pmo / executive / notifications roots", () => {
    const program = buildOrgOsCommandProgram();
    for (const root of AGENT_INFRA_ROOTS) {
      expect(command(program, root).name()).toBe(root);
    }
  });

  it("snapshots agent-infra command trees (names and options)", () => {
    const program = buildOrgOsCommandProgram();
    const snapshots = AGENT_INFRA_ROOTS.map((root) => snapshotRoot(program, root));
    expect(snapshots).toMatchInlineSnapshot(`
      [
        {
          "children": [
            "cloud",
            "dispatch",
            "implement",
            "missions",
            "order",
            "pulse",
            "readiness",
            "relay",
            "report",
            "roster",
          ],
          "name": "agent",
          "nested": {
            "cloud": {
              "children": [
                "config",
                "watch",
              ],
              "options": [],
            },
            "dispatch": {
              "children": [
                "plan",
                "run",
              ],
              "options": [],
            },
            "implement": {
              "children": [],
              "options": [
                "--id",
                "--json",
                "--profile",
              ],
            },
            "missions": {
              "children": [],
              "options": [
                "--agent",
                "--json",
                "--tenant",
              ],
            },
            "order": {
              "children": [],
              "options": [
                "--from",
                "--json",
                "--requirements",
                "--subject",
                "--tenant",
                "--to",
                "--work-order",
              ],
            },
            "pulse": {
              "children": [],
              "options": [
                "--agent",
                "--all",
                "--extensions",
                "--suffix",
                "--tenant",
              ],
            },
            "readiness": {
              "children": [],
              "options": [
                "--agent",
                "--json",
                "--min",
                "--tenant",
              ],
            },
            "relay": {
              "children": [
                "ack",
                "list",
                "summary",
              ],
              "options": [],
            },
            "report": {
              "children": [],
              "options": [
                "--agent",
                "--json",
                "--mission",
                "--no-auto-forward",
                "--path",
                "--subject",
                "--summary",
                "--tenant",
              ],
            },
            "roster": {
              "children": [
                "disable",
                "enable",
                "init",
                "init-all",
                "migrate",
                "show",
                "task",
                "validate",
              ],
              "options": [],
            },
          },
          "options": [],
        },
        {
          "children": [
            "cancel",
            "plan",
            "retry",
            "run",
            "status",
          ],
          "name": "orchestrate",
          "nested": {
            "cancel": {
              "children": [],
              "options": [
                "--id",
              ],
            },
            "plan": {
              "children": [],
              "options": [
                "--acceptance",
                "--background",
                "--deliverable",
                "--depends",
                "--dry-run",
                "--json",
                "--path",
                "--priority",
                "--propose",
                "--requirements",
                "--subject",
                "--tenant",
                "--text",
                "--write",
              ],
            },
            "retry": {
              "children": [],
              "options": [
                "--id",
              ],
            },
            "run": {
              "children": [],
              "options": [
                "--acceptance",
                "--background",
                "--deliverable",
                "--depends",
                "--dry-run",
                "--from",
                "--id",
                "--parallel",
                "--path",
                "--priority",
                "--requirements",
                "--retry-failed",
                "--runtime",
                "--subject",
                "--tenant",
                "--text",
                "--wave",
              ],
            },
            "status": {
              "children": [],
              "options": [
                "--id",
                "--json",
              ],
            },
          },
          "options": [],
        },
        {
          "children": [
            "workers",
          ],
          "name": "llm",
          "nested": {
            "workers": {
              "children": [
                "init",
                "list",
                "probe",
              ],
              "options": [],
            },
          },
          "options": [],
        },
        {
          "children": [
            "rotate-token",
            "serve-http",
            "start",
          ],
          "name": "mcp",
          "nested": {
            "rotate-token": {
              "children": [],
              "options": [],
            },
            "serve-http": {
              "children": [],
              "options": [
                "--host",
                "--port",
              ],
            },
            "start": {
              "children": [],
              "options": [],
            },
          },
          "options": [],
        },
        {
          "children": [
            "milestones",
            "portfolio",
            "risks",
            "show",
          ],
          "name": "pmo",
          "nested": {
            "milestones": {
              "children": [],
              "options": [
                "--days",
                "--json",
              ],
            },
            "portfolio": {
              "children": [],
              "options": [
                "--json",
              ],
            },
            "risks": {
              "children": [],
              "options": [
                "--json",
              ],
            },
            "show": {
              "children": [],
              "options": [
                "--json",
              ],
            },
          },
          "options": [],
        },
        {
          "children": [
            "brief",
            "calendar",
            "scheduling",
            "tasks",
          ],
          "name": "executive",
          "nested": {
            "brief": {
              "children": [],
              "options": [
                "--date",
                "--no-markdown",
                "--output",
                "--week",
              ],
            },
            "calendar": {
              "children": [
                "conflicts",
                "list",
                "pull",
                "push",
              ],
              "options": [],
            },
            "scheduling": {
              "children": [
                "auto-process",
                "cancel",
                "close",
                "confirm",
                "draft",
                "link-mail",
                "list",
                "new",
                "process",
                "propose",
                "rehearsal",
                "reminder-poll",
                "reschedule",
                "respond",
                "show",
              ],
              "options": [],
            },
            "tasks": {
              "children": [
                "add",
                "archive",
                "close",
                "import-p0",
                "intake",
                "list",
              ],
              "options": [],
            },
          },
          "options": [],
        },
        {
          "children": [
            "test",
          ],
          "name": "notifications",
          "nested": {
            "test": {
              "children": [],
              "options": [
                "--dry-run",
                "--event",
              ],
            },
          },
          "options": [],
        },
      ]
    `);
  });

  it("keeps agent-infra roots present in the machine-readable catalog", () => {
    const entries = buildCliCommandCatalog(buildOrgOsCommandProgram());
    const roots = new Set(entries.map((entry) => entry.path[0]));
    for (const root of AGENT_INFRA_ROOTS) {
      expect(roots.has(root)).toBe(true);
    }
  });
});
