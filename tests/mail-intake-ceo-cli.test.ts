import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { parseCeoFieldArgs } from "../src/commands/mail-intake.js";

describe("mail intake ceo answer CLI", () => {
  it("parses repeatable --field <id> <value> pairs from argv", () => {
    const argv = [
      "node",
      "cli.ts",
      "--tenant",
      "mal",
      "mail",
      "intake",
      "ceo",
      "answer",
      "--id",
      "CEO-Q-001",
      "--field",
      "slot_id",
      "SLOT-001",
      "--field",
      "schedule_ceo_choice",
      "確定",
    ];
    expect(parseCeoFieldArgs(argv)).toEqual({
      slot_id: "SLOT-001",
      schedule_ceo_choice: "確定",
    });
  });

  it("accepts --field pairs on the answer subcommand", () => {
    try {
      execFileSync(
        "npm",
        [
          "run",
          "orgos",
          "--",
          "--tenant",
          "mal",
          "mail",
          "intake",
          "ceo",
          "answer",
          "--id",
          "CEO-Q-999-missing",
          "--field",
          "slot_id",
          "SLOT-001",
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, STEWARD_OPERATOR_AUTH: "0" },
          encoding: "utf-8",
        }
      );
      throw new Error("expected command to fail");
    } catch (error) {
      const err = error as { status?: number; stderr?: string; stdout?: string };
      expect(err.status).toBe(1);
      const combined = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      expect(combined).toContain("CEO inline question not found");
    }
  });
});
