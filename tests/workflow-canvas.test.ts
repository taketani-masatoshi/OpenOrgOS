import { describe, expect, it } from "vitest";
import { workflowDocumentSchema } from "../schemas/workflow-canvas.js";
import {
  BUSINESS_WORKFLOW_SAMPLE,
  documentToFlow,
  documentToMermaid,
  documentToTable,
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
      workflow_id: SYSTEM_MAP_SAMPLE.workflow_id,
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
      { version: 1, workflow_id: "WF-strip-test", kind: "business_workflow", title: "Strip test" },
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
        workflow_id: "WF-broken",
        kind: "system_map",
        title: "broken",
        nodes: [{ id: "x", position: { x: 0, y: 0 }, sources: [], targets: [] }],
        edges: [],
      }),
    ).toThrow();
  });

  it("requires workflow_id", () => {
    expect(() =>
      parseWorkflowDocument({
        version: 1,
        kind: "system_map",
        title: "missing id",
        nodes: [],
        edges: [],
      }),
    ).toThrow();
  });
});

describe("workflow projections", () => {
  it("projects a stable table without position columns", () => {
    const table = documentToTable(SYSTEM_MAP_SAMPLE);
    expect(table.nodes).toHaveLength(SYSTEM_MAP_SAMPLE.nodes.length);
    expect(table.edges).toHaveLength(SYSTEM_MAP_SAMPLE.edges.length);
    const ids = table.nodes.map((row) => row.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    for (const row of table.nodes) {
      expect(row).not.toHaveProperty("position");
    }
    expect(table.nodes[0]?.id).toBeTruthy();
    expect(table.edges.every((e) => e.source && e.target)).toBe(true);
  });

  it("projects mermaid with every node id and edge endpoints", () => {
    const mermaid = documentToMermaid(SYSTEM_MAP_SAMPLE);
    expect(mermaid.startsWith("flowchart LR\n")).toBe(true);
    expect(mermaid).toContain(SYSTEM_MAP_SAMPLE.workflow_id);
    for (const node of SYSTEM_MAP_SAMPLE.nodes) {
      expect(mermaid).toContain(node.id);
    }
    for (const edge of SYSTEM_MAP_SAMPLE.edges) {
      expect(mermaid).toContain(`${edge.source} `);
      expect(mermaid).toContain(` ${edge.target}`);
    }
  });

  it("escapes quotes in mermaid labels", () => {
    const doc = parseWorkflowDocument({
      ...SYSTEM_MAP_SAMPLE,
      workflow_id: "WF-quote-test",
      nodes: [
        {
          id: "n1",
          type: "business_task",
          label: 'Say "hello"',
          position: { x: 0, y: 0 },
          sources: [],
          targets: [],
        },
      ],
      edges: [],
    });
    const mermaid = documentToMermaid(doc);
    expect(mermaid).toContain("Say 'hello'");
    expect(mermaid).not.toContain('Say "hello"');
  });
});
