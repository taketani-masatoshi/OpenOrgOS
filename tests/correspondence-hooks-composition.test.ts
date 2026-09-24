/**
 * Contract: composition roots must register correspondence hooks binders.
 * Prevents silent scheduling no-ops when a new entry point forgets the import.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasCorrespondenceHooksBinder } from "../src/lib/correspondence/hooks.js";
import "../src/lib/composition/register-correspondence-hooks.js";

const ROOT = join(import.meta.dirname, "..");

const COMPOSITION_ROOTS = [
  "src/cli.ts",
  "src/lib/cli-program.ts",
  "src/lib/steward-chat/server.ts",
  "tests/helpers/scheduling-fixture.ts",
] as const;

const COMPOSITION_IMPORT = "composition/register-correspondence-hooks";

describe("correspondence hooks composition contract", () => {
  it("registers a binder when the composition module is imported", () => {
    expect(hasCorrespondenceHooksBinder()).toBe(true);
  });

  it.each(COMPOSITION_ROOTS)("%s imports the composition module", (relPath) => {
    const source = readFileSync(join(ROOT, relPath), "utf8");
    expect(source).toContain(COMPOSITION_IMPORT);
  });

  it("does not scatter bind-correspondence-hooks side-effect imports in leaf commands", () => {
    const leaves = [
      "src/commands/mail-outbound.ts",
      "src/commands/mail-intake.ts",
      "src/commands/mail-intake-ceo.ts",
      "src/commands/scheduling-coordination.ts",
      "src/lib/steward-chat/routes/chat-api.ts",
      "src/lib/steward-chat/routes/correspondence-api.ts",
      "src/cli/registrars/executive.ts",
    ];
    for (const relPath of leaves) {
      const source = readFileSync(join(ROOT, relPath), "utf8");
      expect(source).not.toMatch(/import ["'].*bind-correspondence-hooks/);
    }
  });
});
