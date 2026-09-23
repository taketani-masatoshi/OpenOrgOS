import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupSchedulingTenant,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";
import { mutateSchedulingCase } from "../src/lib/scheduling-coordination/case-command.js";
import { SchedulingCaseNotFoundError } from "../src/lib/scheduling-coordination/errors.js";
import { closeSchedulingCase } from "../src/lib/scheduling-coordination/case-mutations.js";

const tenantId = "test-scheduling-fix-f2";

describe("F2 SchedulingCaseNotFoundError", () => {
  beforeEach(() => seedSchedulingTenant(tenantId));
  afterEach(() => cleanupSchedulingTenant(tenantId));

  it("throws Scheduling case <id> not found from mutate and close", () => {
    expect(() => mutateSchedulingCase("SCH-2099-999", { type: "close" })).toThrow(
      SchedulingCaseNotFoundError
    );
    expect(() => mutateSchedulingCase("SCH-2099-999", { type: "close" })).toThrow(
      /Scheduling case SCH-2099-999 not found/
    );
    expect(() => closeSchedulingCase("SCH-2099-999")).toThrow(
      /Scheduling case SCH-2099-999 not found/
    );
  });
});
