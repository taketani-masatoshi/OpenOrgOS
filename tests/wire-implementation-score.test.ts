import { resolve } from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerOrchestrationCommands } from "../src/cli/registrars/orchestration.js";
import {
  evaluateStrictWireImplementationScore,
  evaluateWireImplementationChecklist,
  STRICT_WIRE_SCORE_CATEGORIES,
  STRICT_WIRE_SCORE_TEST_FILES,
  type VitestJsonResult,
} from "../src/lib/protocol/wire-implementation-score.js";

function vitestEvidence(
  statuses: Partial<Record<string, "passed" | "failed">> = {}
): VitestJsonResult {
  return {
    testResults: STRICT_WIRE_SCORE_TEST_FILES.map((file) => {
      const status = statuses[file] ?? "passed";
      return {
        name: resolve(file),
        status,
        assertionResults: [
          { status },
          { status: status === "passed" ? "passed" : "failed" },
        ],
      };
    }),
  };
}

describe("wire implementation checklist", () => {
  it("labels static inspection honestly", () => {
    const checklist = evaluateWireImplementationChecklist();
    expect(checklist.mode).toBe("checklist");
    expect(checklist.label).toContain("not a runtime score");
    expect(checklist.max).toBe(100);
  });
});

describe("wire implementation score (strict runtime)", () => {
  it("does not award points from source strings or existing files without execution evidence", () => {
    const score = evaluateStrictWireImplementationScore({ vitest: { testResults: [] } });

    expect(score.mode).toBe("strict-runtime");
    expect(score.total).toBe(0);
    expect(score.items.every((item) => item.points === 0)).toBe(true);
    expect(score.items.flatMap((item) => item.detail ?? [])).toContain(
      "tests/wire-gateway-server.test.ts not executed; tests/wire-two-gateway-e2e.test.ts not executed"
    );
  });

  it("awards points only to categories backed by passed Vitest suites", () => {
    const score = evaluateStrictWireImplementationScore({ vitest: vitestEvidence() });

    expect(score.max).toBe(100);
    expect(score.total).toBe(100);
    expect(score.grade).toBe("enterprise");
    expect(score.items.length).toBe(10);
    expect(score.items.every((item) => item.ok)).toBe(true);
    expect(score.evidence?.runner).toBe("vitest");
    expect(score.evidence?.passed_assertions).toBeGreaterThanOrEqual(20);
  });

  it("reduces strict points when execution evidence fails", () => {
    const passing = evaluateStrictWireImplementationScore({ vitest: vitestEvidence() });
    const failing = evaluateStrictWireImplementationScore({
      vitest: vitestEvidence({ "tests/wire-gateway-security-e2e.test.ts": "failed" }),
      exitCode: 1,
    });

    expect(failing.total).toBeLessThan(passing.total);
    expect(failing.items.find((item) => item.id === "security")).toMatchObject({
      ok: false,
      points: 0,
    });
    expect(failing.items.find((item) => item.id === "trust-id")?.points).toBeLessThan(12);
    expect(failing.evidence?.failed_files).toContain(
      "tests/wire-gateway-security-e2e.test.ts"
    );
  });

  it("requires every mapped suite for each category", () => {
    const firstCategory = STRICT_WIRE_SCORE_CATEGORIES[0];
    const partial = vitestEvidence();
    partial.testResults = partial.testResults?.filter(
      (result) => !result.name?.endsWith(firstCategory.suites[1])
    );

    const score = evaluateStrictWireImplementationScore({ vitest: partial });
    expect(score.items.find((item) => item.id === firstCategory.id)).toMatchObject({
      ok: false,
      points: 6,
    });
  });
});

describe("wire-gateway score CLI registration", () => {
  it("registers --strict and --json", () => {
    const program = new Command();
    registerOrchestrationCommands(program);

    const wireGateway = program.commands.find((command) => command.name() === "wire-gateway");
    const score = wireGateway?.commands.find((command) => command.name() === "score");

    expect(score?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(["--strict", "--json"])
    );
  });
});
