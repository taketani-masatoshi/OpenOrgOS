import { z } from "zod";

export const operatorActionPrioritySchema = z.enum(["p0", "p1", "p2"]);

export const operatorActionSchema = z.object({
  priority: operatorActionPrioritySchema,
  label: z.string(),
  ref_id: z.string().optional(),
});

export const operatorConfidenceSchema = z.enum(["high", "medium", "low"]);

export const operatorResponseSchema = z.object({
  summary: z.string(),
  risks: z.array(z.string()).default([]),
  actions: z.array(operatorActionSchema).default([]),
  confidence: operatorConfidenceSchema.default("medium"),
});

export type OperatorResponse = z.output<typeof operatorResponseSchema>;
export type OperatorAction = z.output<typeof operatorActionSchema>;

/** OpenAI json_schema response_format payload */
export function operatorResponseJsonSchema(): Record<string, unknown> {
  return {
    name: "operator_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "CEO-facing summary in Markdown" },
        risks: { type: "array", items: { type: "string" } },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              priority: { type: "string", enum: ["p0", "p1", "p2"] },
              label: { type: "string" },
              ref_id: { type: "string" },
            },
            required: ["priority", "label"],
            additionalProperties: false,
          },
        },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["summary", "risks", "actions", "confidence"],
      additionalProperties: false,
    },
  };
}

export function formatOperatorResponseMarkdown(resp: OperatorResponse): string {
  const lines = [resp.summary, ""];
  if (resp.risks.length) {
    lines.push("## リスク", "");
    for (const r of resp.risks) lines.push(`- ${r}`);
    lines.push("");
  }
  if (resp.actions.length) {
    lines.push("## 推奨アクション", "");
    for (const a of resp.actions) {
      const ref = a.ref_id ? ` (${a.ref_id})` : "";
      lines.push(`- **[${a.priority.toUpperCase()}]** ${a.label}${ref}`);
    }
    lines.push("");
  }
  lines.push(`_信頼度: ${resp.confidence}_`);
  return lines.join("\n");
}
