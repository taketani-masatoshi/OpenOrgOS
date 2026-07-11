import { describe, it, expect, vi } from "vitest";
import {
  buildPlatformGuideMarkdown,
  buildPlatformGuideJson,
  resolvePlatformGuideTopics,
} from "../src/lib/platform-implement-guide.js";
import { runPlatformGuide } from "../src/commands/platform-guide.js";

describe("platform-implement-guide", () => {
  it("resolvePlatformGuideTopics defaults to all sections", () => {
    expect(resolvePlatformGuideTopics(undefined)).toHaveLength(7);
    expect(resolvePlatformGuideTopics("all")).toHaveLength(7);
  });

  it("resolvePlatformGuideTopics filters single topic", () => {
    expect(resolvePlatformGuideTopics("wire")).toEqual(["wire"]);
  });

  it("resolvePlatformGuideTopics rejects unknown topic", () => {
    expect(() => resolvePlatformGuideTopics("nope")).toThrow(/Unknown topic/);
  });

  it("buildPlatformGuideMarkdown includes agent path and wire section", () => {
    const md = buildPlatformGuideMarkdown(["wire"]);
    expect(md).toContain("Wire / Hub");
    expect(md).toContain("platform_guide_agent.md");
    expect(md).toContain("wire-gateway-requirements.md");
  });

  it("buildPlatformGuideJson returns structured checklist", () => {
    const doc = buildPlatformGuideJson(["agent"]) as {
      agent: string;
      topics: Array<{ topic: string; checklist: string[] }>;
    };
    expect(doc.agent).toBe("platform_guide");
    expect(doc.topics).toHaveLength(1);
    expect(doc.topics[0]?.topic).toBe("agent");
    expect(doc.topics[0]?.checklist.some((l) => l.includes("registry.yaml"))).toBe(true);
  });

  it("runPlatformGuide prints markdown to stdout", () => {
    const lines: string[] = [];
    const errLines: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      errLines.push(String(chunk));
      return true;
    });
    runPlatformGuide({ topic: "eval" });
    outSpy.mockRestore();
    errSpy.mockRestore();
    expect(errLines.join("")).toContain("DEPRECATED");
    expect(lines.join("")).toContain("評価");
    expect(lines.join("")).toContain("validate");
  });
});
