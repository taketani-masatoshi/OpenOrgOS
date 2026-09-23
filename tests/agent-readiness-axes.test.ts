import { beforeAll, describe, expect, it } from "vitest";
import {
  computeAgentReadiness,
  computeAgentReadinessProfile,
} from "../src/lib/agent-readiness.js";
import { listCatalogAgents } from "../src/lib/agent-catalog.js";
import { setTenantId } from "../src/lib/tenant.js";

/** Compact axis fingerprint for inline snapshots (score/max only — detail may drift). */
function axisFingerprint(agentId: string) {
  const result = computeAgentReadiness(agentId as never);
  return {
    agent_id: result.agent_id,
    profile: result.profile,
    pct: result.pct,
    total: result.total,
    axes: result.axes.map((axis) => ({
      id: axis.id,
      score: axis.score,
      max: axis.max,
    })),
  };
}

describe("agent readiness axis scores (characterization)", () => {
  beforeAll(() => {
    setTenantId("mal");
  });

  it("operational representative (finance) axis scores stay fixed", () => {
    expect(axisFingerprint("finance")).toMatchInlineSnapshot(`
      {
        "agent_id": "finance",
        "axes": [
          {
            "id": "definition",
            "max": 15,
            "score": 15,
          },
          {
            "id": "skill_cli",
            "max": 20,
            "score": 20,
          },
          {
            "id": "data_sot",
            "max": 15,
            "score": 15,
          },
          {
            "id": "routing",
            "max": 10,
            "score": 10,
          },
          {
            "id": "dashboard",
            "max": 15,
            "score": 13,
          },
          {
            "id": "test",
            "max": 10,
            "score": 10,
          },
          {
            "id": "tenant",
            "max": 15,
            "score": 15,
          },
        ],
        "pct": 98,
        "profile": "operational",
        "total": 98,
      }
    `);
  });

  it("advisor representative (platform_guide) axis scores stay fixed", () => {
    expect(axisFingerprint("platform_guide")).toMatchInlineSnapshot(`
      {
        "agent_id": "platform_guide",
        "axes": [
          {
            "id": "definition",
            "max": 15,
            "score": 15,
          },
          {
            "id": "skill_cli",
            "max": 20,
            "score": 14,
          },
          {
            "id": "routing",
            "max": 10,
            "score": 10,
          },
          {
            "id": "data_sot",
            "max": 15,
            "score": 15,
          },
          {
            "id": "dashboard",
            "max": 15,
            "score": 15,
          },
          {
            "id": "test",
            "max": 10,
            "score": 10,
          },
          {
            "id": "tenant",
            "max": 15,
            "score": 15,
          },
        ],
        "pct": 94,
        "profile": "advisor",
        "total": 94,
      }
    `);
  });

  it("bootstrap profile axis fingerprint when catalog has bootstrap agents", () => {
    const bootstrap = listCatalogAgents().filter(
      (agent) => agent.readiness_profile === "bootstrap" && agent.status !== "planned",
    );
    if (bootstrap.length === 0) {
      expect(computeAgentReadinessProfile("bootstrap")).toEqual([]);
      return;
    }
    const id = bootstrap[0]!.id;
    const finger = axisFingerprint(id);
    expect(finger.profile).toBe("bootstrap");
    expect(finger.axes.length).toBeLessThan(7);
    // Snapshot only when catalog actually ships a bootstrap agent.
    expect(finger.axes.map((a) => a.id)).toEqual([
      "definition",
      "skill_cli",
      "data_sot",
      "test",
    ]);
  });

  it("computeAgentReadinessProfile returns non-empty operational and advisor sets on mal", () => {
    const operational = computeAgentReadinessProfile("operational");
    const advisor = computeAgentReadinessProfile("advisor");
    expect(operational.length).toBeGreaterThan(0);
    expect(advisor.some((r) => r.agent_id === "platform_guide")).toBe(true);
    expect(operational.every((r) => r.profile === "operational")).toBe(true);
  });
});
