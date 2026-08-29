import { describe, expect, it } from "vitest";
import {
  decodeLlmRouteSelect,
  encodeLlmRouteSelect,
  parseLlmRouteHint,
} from "../apps/steward-chat/src/llmRoute.ts";

describe("llm route hint", () => {
  it("encodes auto, tier, and pin", () => {
    expect(encodeLlmRouteSelect({ mode: "auto" })).toBe("auto");
    expect(encodeLlmRouteSelect({ mode: "local" })).toBe("local");
    expect(encodeLlmRouteSelect({ mode: "cloud", worker_id: "openai-01" })).toBe(
      "cloud:openai-01",
    );
  });

  it("decodes select values", () => {
    expect(decodeLlmRouteSelect("auto")).toEqual({ mode: "auto" });
    expect(decodeLlmRouteSelect("local")).toEqual({ mode: "local" });
    expect(decodeLlmRouteSelect("cloud:openai-01")).toEqual({
      mode: "cloud",
      worker_id: "openai-01",
    });
    expect(decodeLlmRouteSelect("nope")).toEqual({ mode: "auto" });
  });

  it("ignores worker_id on auto", () => {
    expect(parseLlmRouteHint({ mode: "auto", worker_id: "x" })).toEqual({
      mode: "auto",
    });
  });
});
