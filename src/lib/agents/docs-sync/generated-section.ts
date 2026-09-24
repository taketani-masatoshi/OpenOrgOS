export const GENERATED_MARKER_PREFIX = "orgos:generated";

export function generatedMarker(name: string, end = false): string {
  return `<!-- ${GENERATED_MARKER_PREFIX}:${name}:${end ? "end" : "start"} -->`;
}

export function replaceGeneratedSection(
  markdown: string,
  name: string,
  generatedBody: string
): string {
  const start = generatedMarker(name, false);
  const end = generatedMarker(name, true);
  const block = `${start}\n${generatedBody.trimEnd()}\n${end}`;
  const pattern = new RegExp(
    `${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
  );
  if (pattern.test(markdown)) return markdown.replace(pattern, block);
  return `${markdown.trimEnd()}\n\n${block}\n`;
}

export function extractGeneratedSection(markdown: string, name: string): string | undefined {
  const start = generatedMarker(name, false);
  const end = generatedMarker(name, true);
  const pattern = new RegExp(
    `${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n([\\s\\S]*?)\\n${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
  );
  return pattern.exec(markdown)?.[1];
}
