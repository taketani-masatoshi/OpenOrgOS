import { describe, expect, it } from "vitest";
import { validateProtocolLayerCatalog } from "../src/lib/protocol/layer-catalog.js";
import { collectProtocolLayerViolationKeys } from "../src/lib/protocol/layer-dependency-scan.js";
import { PROTOCOL_LAYER_VIOLATION_BASELINE } from "../src/lib/protocol/layer-violation-baseline.js";

describe("protocol layer dependency direction", () => {
  it("assigns every implementation module to a layer", () => {
    expect(validateProtocolLayerCatalog()).toEqual([]);
  });

  it("does not grow the upward-dependency baseline", () => {
    const actual = collectProtocolLayerViolationKeys();
    const baseline = new Set(PROTOCOL_LAYER_VIOLATION_BASELINE);
    const novel = actual.filter((key) => !baseline.has(key));
    expect(novel).toEqual([]);
  });

  it("tracks current violations only as an explicit baseline", () => {
    const actual = new Set(collectProtocolLayerViolationKeys());
    const stale = PROTOCOL_LAYER_VIOLATION_BASELINE.filter((key) => !actual.has(key));
    expect(stale).toEqual([]);
  });
});
