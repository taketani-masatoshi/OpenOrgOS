import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerPlatformCommands } from "../src/cli/registrars/platform.js";
import { registerOrchestrationCommands } from "../src/cli/registrars/orchestration.js";

function command(parent: Command, name: string): Command {
  const found = parent.commands.find((candidate) => candidate.name() === name);
  if (!found) throw new Error(`missing command: ${parent.name()} ${name}`);
  return found;
}

function buildProgram(): Command {
  const program = new Command().name("orgos");
  program.exitOverride();
  registerPlatformCommands(program);
  registerOrchestrationCommands(program);
  return program;
}

describe("Wire CLI surface contract", () => {
  it("exposes orgos wire as the canonical facade", () => {
    const wire = command(buildProgram(), "wire");

    expect(wire.description()).toMatch(/canonical/i);
    expect(wire.commands.map((item) => item.name())).toEqual(
      expect.arrayContaining(["gateway", "peer", "delivery", "witness", "score"])
    );
    expect(command(wire, "gateway").commands.map((item) => item.name())).toEqual(
      expect.arrayContaining(["serve", "init", "validate", "discover"])
    );
    expect(command(wire, "peer").commands.map((item) => item.name())).toEqual(
      expect.arrayContaining(["register", "discover", "migrate-legacy"])
    );
    expect(command(wire, "delivery").commands.map((item) => item.name())).toEqual(
      expect.arrayContaining(["send", "status", "flush-pending", "pull"])
    );
    expect(command(wire, "witness").commands.map((item) => item.name())).toEqual(
      expect.arrayContaining(["register", "verify", "flush-pending", "pool"])
    );
    expect(command(wire, "score").options.map((option) => option.long)).toEqual(
      expect.arrayContaining(["--strict", "--json"])
    );
  });

  it("retains legacy roots as documented compatibility aliases", () => {
    const program = buildProgram();
    for (const name of ["protocol", "wire-gateway", "hub"]) {
      expect(command(program, name).description()).toMatch(/compatibility alias|deprecated/i);
    }
  });

  it("distinguishes internal automation webhook from legacy Wire transport", () => {
    const program = buildProgram();
    expect(command(program, "webhook").description()).toMatch(/internal/i);

    const migrate = command(command(command(program, "wire"), "peer"), "migrate-legacy");
    expect(migrate.description()).toContain("2026-10-01");
    expect(migrate.description()).toMatch(/not orgos webhook/i);
    expect(migrate.options.map((option) => option.long)).toContain("--to-wire-url");
  });
});
