import { describe, expect, it } from "vitest";
import { workflowDocumentSchema } from "../schemas/workflow-canvas.js";
import {
  BUSINESS_WORKFLOW_SAMPLE,
  documentToFlow,
  exportToJSON,
  parseWorkflowDocument,
  SYSTEM_MAP_SAMPLE,
} from "../src/lib/workflow-canvas/index.js";

describe("workflow canvas document", () => {
  it("accepts the system-map sample", () => {
    expect(workflowDocumentSchema.parse(SYSTEM_MAP_SAMPLE)).toEqual(SYSTEM_MAP_SAMPLE);
  });

  it("accepts the business-workflow sample", () => {
    expect(workflowDocumentSchema.parse(BUSINESS_WORKFLOW_SAMPLE)).toEqual(
      BUSINESS_WORKFLOW_SAMPLE,
    );
  });

  it("annotates source/target dependencies on every node", () => {
    const register = SYSTEM_MAP_SAMPLE.nodes.find((node) => node.id === "task-guest-register");
    expect(register?.sources.sort()).toEqual(["aia-secretary", "mod-hospitality"]);
    expect(register?.targets).toEqual([]);
    const steward = SYSTEM_MAP_SAMPLE.nodes.find((node) => node.id === "aia-executive-steward");
    expect(steward?.targets.sort()).toEqual(["aia-finance", "mod-steward-chat"]);
  });

  it("round-trips React Flow snapshots through exportToJSON", () => {
    const flow = documentToFlow(SYSTEM_MAP_SAMPLE);
    const exported = exportToJSON(flow.nodes, flow.edges, {
      version: SYSTEM_MAP_SAMPLE.version,
      kind: SYSTEM_MAP_SAMPLE.kind,
      title: SYSTEM_MAP_SAMPLE.title,
      description: SYSTEM_MAP_SAMPLE.description,
    });
    expect(exported).toEqual(SYSTEM_MAP_SAMPLE);
  });

  it("strips React Flow internals from exportToJSON", () => {
    const exported = exportToJSON(
      [
        {
          id: "n1",
          type: "aia_agent",
          position: { x: 10, y: 20 },
          data: { label: "Secretary", agent_id: "secretary" },
          selected: true,
          dragging: true,
          measured: { width: 180, height: 72 },
        } as never,
      ],
      [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          label: "handoff",
          selected: true,
        },
      ],
      { version: 1, kind: "business_workflow", title: "Strip test" },
    );
    expect(exported.nodes[0]).toEqual({
      id: "n1",
      type: "aia_agent",
      label: "Secretary",
      position: { x: 10, y: 20 },
      sources: [],
      targets: ["n2"],
      data: { agent_id: "secretary" },
    });
    expect(exported.nodes[0]).not.toHaveProperty("selected");
    expect(exported.nodes[0]).not.toHaveProperty("measured");
    expect(JSON.parse(JSON.stringify(exported.edges[0]))).toEqual({
      id: "e1",
      source: "n1",
      target: "n2",
      label: "handoff",
    });
  });

  it("rejects documents that omit node type or label", () => {
    expect(() =>
      parseWorkflowDocument({
        version: 1,
        kind: "system_map",
        title: "broken",
        nodes: [{ id: "x", position: { x: 0, y: 0 }, sources: [], targets: [] }],
        edges: [],
      }),
    ).toThrow();
  });
});
