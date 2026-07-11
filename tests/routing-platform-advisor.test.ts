import { describe, it, expect } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { pickBestRoute, matchRoutes } from "../src/lib/routing.js";
import { isAgentActive } from "../src/lib/agent-catalog.js";

describe("routing platform advisor", () => {
  it("routes platform implementation to engineering not platform_guide", () => {
    setTenantId("mal");
    const best = pickBestRoute({ text: "Agent追加の実装をお願い", profile: "operational" });
    expect(best?.route.agent).toBe("engineering");
    expect(best?.route.id).toBe("engineering-code");
  });

  it("routes architecture decisions to cto", () => {
    setTenantId("mal");
    const best = pickBestRoute({ text: "アーキテクチャの設計判断", profile: "operational" });
    expect(best?.route.agent).toBe("cto");
  });

  it("routes wire production gate to security", () => {
    setTenantId("mal");
    const best = pickBestRoute({ text: "Wire production gate を確認", profile: "operational" });
    expect(best?.route.agent).toBe("security");
  });

  it("does not auto-route platform_guide in operational profile", () => {
    setTenantId("mal");
    const matches = matchRoutes({ text: "OpenOrgOS プラットフォーム extensibility", profile: "operational" });
    const guide = matches.find((m) => m.route.agent === "platform_guide");
    expect(guide).toBeUndefined();
  });

  it("platform_guide is inactive without developer roster", () => {
    expect(isAgentActive("platform_guide", { profile: "developer", mode: "consult" })).toBe(false);
  });

  it("surfaces platform-guide-consult only on developer profile", () => {
    setTenantId("mal");
    const operational = matchRoutes({ text: "platform guide consult", profile: "operational" });
    expect(operational.find((m) => m.route.id === "platform-guide-consult")).toBeUndefined();
    const developer = matchRoutes({ text: "platform guide consult", profile: "developer" });
    expect(developer.find((m) => m.route.id === "platform-guide-consult")).toBeDefined();
  });
});
