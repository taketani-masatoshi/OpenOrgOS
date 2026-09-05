import { describe, expect, it } from "vitest";
import {
  decodeLlmRouteSelect,
  encodeLlmRouteSelect,
  localWorkerModelOptions,
  parseLlmRouteHint,
} from "../apps/steward-chat/src/llmRoute.ts";

describe("llm route hint", () => {
  it("encodes auto, tier, and pin", () => {
    expect(encodeLlmRouteSelect({ mode: "auto" })).toBe("auto");
    expect(encodeLlmRouteSelect({ mode: "local" })).toBe("local");
    expect(encodeLlmRouteSelect({ mode: "cloud", worker_id: "openai-01" })).toBe(
      "cloud:openai-01",
    );
    expect(
      encodeLlmRouteSelect({
        mode: "local",
        worker_id: "local-01",
        model: "qwen2.5:14b",
      }),
    ).toBe("local:local-01|qwen2.5%3A14b");
  });

  it("decodes select values", () => {
    expect(decodeLlmRouteSelect("auto")).toEqual({ mode: "auto" });
    expect(decodeLlmRouteSelect("local")).toEqual({ mode: "local" });
    expect(decodeLlmRouteSelect("cloud:openai-01")).toEqual({
      mode: "cloud",
      worker_id: "openai-01",
    });
    expect(decodeLlmRouteSelect("local:local-01|qwen2.5%3A14b")).toEqual({
      mode: "local",
      worker_id: "local-01",
      model: "qwen2.5:14b",
    });
    expect(decodeLlmRouteSelect("nope")).toEqual({ mode: "auto" });
  });

  it("lists local model options the compact picker renders", () => {
    const rows = localWorkerModelOptions(
      [
        { id: "local-01", model: "fallback" },
        { id: "local-02", model: "only-default" },
      ],
      { "local-01": ["qwen2.5:14b", "gemma4:12b"] },
    );
    expect(rows.map((row) => row.model)).toEqual([
      "qwen2.5:14b",
      "gemma4:12b",
      "only-default",
    ]);
    expect(
      rows.every((row) => decodeLlmRouteSelect(row.value).model === row.model),
    ).toBe(true);
  });

  it("ignores worker_id on auto", () => {
    expect(parseLlmRouteHint({ mode: "auto", worker_id: "x" })).toEqual({
      mode: "auto",
    });
  });
});
