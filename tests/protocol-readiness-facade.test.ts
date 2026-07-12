import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agentCatalogEntrySchema } from "../schemas/agent-catalog.js";
import { eventEnvelopeSchema as compatibilityEventEnvelopeSchema } from "../schemas/protocol/org-event.js";
import { protocolCore } from "../schemas/protocol/index.js";
import { ourOrgRef as compatibilityOurOrgRef } from "../src/lib/protocol/identity.js";
import { core as protocolCoreRuntime } from "../src/lib/protocol/index.js";
import {
  computeAllAgentReadinessProfiles,
  computeAgentReadiness,
} from "../src/lib/agent-readiness.js";
import { computeReadinessStatus } from "../src/lib/readiness.js";
import { runStatus } from "../src/commands/status.js";
import { setTenantId } from "../src/lib/tenant.js";
import { exportCommunityProtocolBundle } from "../src/lib/protocol/community-export.js";
import { validateCommunityExportDeterminism } from "../src/lib/generated-artifacts.js";
import { exportPortableAgents } from "../src/lib/agent-portability.js";

describe("logical protocol boundaries", () => {
  it("keeps physical imports as compatibility aliases", () => {
    expect(protocolCore.eventEnvelopeSchema).toBe(compatibilityEventEnvelopeSchema);
    expect(protocolCoreRuntime.ourOrgRef).toBe(compatibilityOurOrgRef);
  });
});

describe("readiness profiles and facade", () => {
  beforeAll(() => setTenantId("acme"));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("supports operational, advisor, and bootstrap profiles", () => {
    const parsed = agentCatalogEntrySchema.parse({
      id: "platform_guide",
      name: "Bootstrap fixture",
      path: "steward/core/agents/platform_guide_agent.md",
      readiness_profile: "bootstrap",
    });
    expect(parsed.readiness_profile).toBe("bootstrap");

    const profiles = computeAllAgentReadinessProfiles();
    expect(Object.keys(profiles)).toEqual(["operational", "advisor", "bootstrap"]);
    expect(profiles.advisor.some((result) => result.agent_id === "platform_guide")).toBe(true);
  });

  it("scores test evidence, activation, and boundary instead of manifest membership", () => {
    const result = computeAgentReadiness("finance");
    const evidence = result.axes.find((axis) => axis.id === "test");
    expect(evidence?.label).toBe("証拠");
    expect(evidence?.detail).toContain("activation:");
    expect(evidence?.detail).toContain("boundary:");
    expect(evidence?.detail).toContain("skills:");
  });

  it("returns one JSON-safe Core/OrgOS/Wire/Community facade", () => {
    const readiness = computeReadinessStatus();
    expect(readiness.version).toBe(1);
    expect(readiness.core.strict.weighted).toBeTypeOf("number");
    expect(readiness.orgos.strict.weighted).toBeTypeOf("number");
    expect(readiness.wire.checklist.mode).toBe("checklist");
    expect(readiness.wire.strict).toBeNull();
    expect(readiness.community.score).toBeTypeOf("number");
    expect(() => JSON.stringify(readiness)).not.toThrow();
  });

  it("integrates the facade into status JSON output", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    runStatus({ readiness: true, json: true });
    const value = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(value).toMatchObject({
      version: 1,
      wire: { strict: null },
    });
  });
});

describe("deterministic Community generation", () => {
  it("regenerates without timestamp-only differences", () => {
    expect(validateCommunityExportDeterminism()).toEqual([]);

    const root = mkdtempSync(join(tmpdir(), "orgos-community-test-"));
    try {
      const result = exportCommunityProtocolBundle(root);
      const readiness = JSON.parse(
        readFileSync(join(result.dest, "community-readiness.json"), "utf-8")
      );
      expect(readiness).not.toHaveProperty("generated_at");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("incremental Agent exports", () => {
  it("does not rewrite an unchanged Agent pack", () => {
    exportPortableAgents({ agent: "finance", emit: "packs" });
    const second = exportPortableAgents({ agent: "finance", emit: "packs" });
    expect(second.changedPacks).toEqual([]);
    expect(second.packs).toHaveLength(1);
  });
});
