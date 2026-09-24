export interface McpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export function textResult(text: string, isError = false): McpToolResult {
  return isError
    ? { content: [{ type: "text", text }], isError: true }
    : { content: [{ type: "text", text }] };
}

export function jsonResult(value: unknown): McpToolResult {
  return textResult(JSON.stringify(value, null, 2));
}

export function errorResult(text: string): McpToolResult {
  return textResult(text, true);
}
