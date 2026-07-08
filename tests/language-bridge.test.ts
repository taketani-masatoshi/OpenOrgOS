import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  resolveLanguageBridge,
  validateLanguageBridge,
  buildMinutesDraftMarkdown,
  loadLanguageBridgeConfig,
} from "../steward/modules/language_bridge/cli/lib.js";
import { loadSkillRegistry, validateSkillRegistryFiles } from "../src/lib/skill-registry.js";
import { loadModuleManifest } from "../src/lib/modules.js";

describe("language_bridge module", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  it("has manifest and skill registry", () => {
    const manifest = loadModuleManifest("language_bridge");
    expect(manifest?.id).toBe("language_bridge");
    const skill = loadSkillRegistry().find((s) => s.id === "language_bridge");
    expect(skill?.agent).toBe("Secretary");
    expect(validateSkillRegistryFiles()).toEqual([]);
  });

  it("loads hk-demo config with zh-Hant system language", () => {
    const config = loadLanguageBridgeConfig();
    expect(config?.system_language).toBe("zh-Hant");
  });

  it("resolves bridged user en vs system zh-Hant on hk-demo", () => {
    const resolved = resolveLanguageBridge();
    expect(resolved.userLanguage).toBe("en");
    expect(resolved.systemLanguage).toBe("zh-Hant");
    expect(resolved.bridged).toBe(true);
    expect(resolved.layout).toBe("system_primary");
  });

  it("validates hk-demo config", () => {
    expect(validateLanguageBridge()).toEqual([]);
  });

  it("generates bilingual minutes scaffold", () => {
    const md = buildMinutesDraftMarkdown({
      docType: "board_minutes",
      title: "Q1 Board",
      date: "2026-06-25",
    });
    expect(md).toContain("[SYSTEM]");
    expect(md).toContain("[USER]");
    expect(md).toContain("zh-Hant");
    expect(md).toContain("user_language: en");
  });
});

describe("language_bridge same language", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("does not bridge when strategy same_as_user without explicit system", () => {
    const resolved = resolveLanguageBridge();
    expect(resolved.userLanguage).toBe("ja");
    expect(resolved.systemLanguage).toBe("ja");
    expect(resolved.bridged).toBe(false);
  });
});
