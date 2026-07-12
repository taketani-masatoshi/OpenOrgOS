/**
 * Event-first route dispatch evidence:
 * match → handoff → evaluate (aligned direct / misaligned Work Order).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { resetAgentCatalogCache } from "../src/lib/agent-catalog.js";
import {
  buildHandoff,
  matchRoutes,
  pickBestRoute,
} from "../src/lib/routing.js";
import {
  evaluateRouteExecution,
  type InvocationResolver,
} from "../src/lib/route-execution.js";
import { resolveSkillDispatch } from "../src/commands/skills.js";
import type { SkillInvocationResolution } from "../src/lib/skill-invocation.js";
import { resetRuntimeContext, setRuntimeContext } from "../src/lib/runtime-context.js";

const FIXED_UUID = "00000000-0000-4000-8000-000000000901";

describe("route dispatch event-first (monthly_close)", () => {
  beforeEach(() => {
    process.env.ORGOS_AUDIT_LOG_DISABLED = "1";
    process.env.ORGOS_AUDIT_BRIDGE_DISABLED = "1";
    resetAgentCatalogCache();
    setTenantId("acme");
    setRuntimeContext({
      clock: {
        now: () => new Date("2026-07-12T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-07-12T00:00:00.000Z"),
        nowIso: () => "2026-07-12T00:00:00.000Z",
      },
      idGenerator: {
        randomSuffix: () => "route1",
        uniqueId: (prefix) => `${prefix}-FIXED`,
        uuid: () => FIXED_UUID,
      },
    });
  });

  afterEach(() => {
    delete process.env.ORGOS_AUDIT_LOG_DISABLED;
    delete process.env.ORGOS_AUDIT_BRIDGE_DISABLED;
    resetRuntimeContext();
  });

  it("picks monthly-close for 月次締め with classification access allowed", () => {
    const best = pickBestRoute({ text: "月次締め" });
    expect(best).toBeDefined();
    expect(best!.route.id).toBe("monthly-close");
    expect(best!.route.agent).toBe("finance");
    expect(best!.route.skill).toBe("monthly_close");
    expect(best!.access.allowed).toBe(true);
    expect(best!.blockedReasons).toEqual([]);
  });

  it("aligned finance handoff plans direct_skill (or deferred if args missing)", () => {
    const matched = matchRoutes({ text: "月次締め" }).find((m) => m.route.id === "monthly-close");
    expect(matched?.access.allowed).toBe(true);

    const handoff = buildHandoff(
      { text: "月次締め", mode: "auto", fromAgent: "steward" },
      matched
    );
    expect(handoff.to_agent).toBe("finance");
    expect(handoff.skill).toBe("monthly_close");
    expect(handoff.status).toBe("pending");
    expect(handoff.id).toBe("HO-20260712-route1");
    expect(handoff.created_at).toBe("2026-07-12T00:00:00.000Z");

    const outcome = evaluateRouteExecution(handoff, "auto", resolveSkillDispatch);
    expect(["direct_skill", "deferred"]).toContain(outcome.action);
    expect(outcome.handoff.invocation?.decision).toBe("direct_skill");
    expect(outcome.message).toMatch(/authority aligned|deferred|missing|month/i);
  });

  it("misaligned to_agent delegates to Work Order instead of running finance CLI", () => {
    const matched = matchRoutes({ text: "月次締め" }).find((m) => m.route.id === "monthly-close");
    const handoff = buildHandoff(
      { text: "月次締め", mode: "auto", fromAgent: "steward", toAgent: "secretary" },
      matched
    );
    expect(handoff.to_agent).toBe("secretary");
    expect(handoff.skill).toBe("monthly_close");

    const handler = vi.fn();
    const resolve: InvocationResolver = () =>
      ({
        status: "ready",
        execution: "handler",
        skill: {
          id: "monthly_close",
          file: "monthly_close.md",
          runtime: "cli",
          cli_command: "monthly-close",
          handler: "monthly_close",
          agent_id: "finance",
          description: "monthly close",
          skillDir: "/tmp",
          skillDirRel: "steward/core/skills",
        },
        handler,
        argv: ["skills", "run", "monthly-close"],
      }) satisfies SkillInvocationResolution;

    const outcome = evaluateRouteExecution(handoff, "auto", resolve);
    expect(outcome.action).toBe("work_order");
    expect(outcome.message).toContain("executing agent finance");
    expect(outcome.handoff.invocation?.decision).toBe("work_order");
    expect(handler).not.toHaveBeenCalled();
  });
});
