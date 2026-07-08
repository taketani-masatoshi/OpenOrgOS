/** Step 6 — Secretary relay 3 行（escalate merge 完了時 stdout 用） */

export function formatSecretaryRelayBlock(content: string, notePath: string): string {
  const filename = notePath.split("/").pop() ?? notePath;
  const conclusion = extractSection(content, "統合結論") ?? extractFirstParagraph(content);
  const actions = extractActionLines(content).slice(0, 3);

  const lines = [
    "── Secretary relay（段へそのまま貼付可）──",
    conclusion ? `**結論:** ${conclusion.replace(/\n/g, " ").slice(0, 200)}` : "**結論:** （executive-notes を確認）",
  ];

  if (actions.length) {
    lines.push("**次アクション:**");
    for (const a of actions) {
      lines.push(`- ${a}`);
    }
  }

  lines.push(`**根拠:** ${filename}（L2 値は転記しない）`);
  lines.push("────────────────────────────────────");
  return lines.join("\n");
}

function extractSection(md: string, heading: string): string | undefined {
  const re = new RegExp(`##\\s*${heading}[^\\n]*\\n+([\\s\\S]*?)(?=\\n##|$)`, "i");
  const m = md.match(re);
  if (!m?.[1]) return undefined;
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("|") && !l.startsWith("---"))
    .slice(0, 3)
    .join(" ")
    .trim();
}

function extractFirstParagraph(md: string): string | undefined {
  const body = md.replace(/^#.*$/m, "").trim();
  const para = body.split(/\n\n+/).find((p) => p.trim() && !p.startsWith("|"));
  return para?.replace(/\n/g, " ").trim();
}

function extractActionLines(md: string): string[] {
  const section = extractSection(md, "段のアクション") ?? extractSection(md, "推奨アクション");
  if (!section) {
    return md
      .split("\n")
      .filter((l) => /^\d+\.\s/.test(l.trim()) || /^-\s/.test(l.trim()))
      .map((l) => l.replace(/^[\d.-]+\s*/, "").trim())
      .slice(0, 3);
  }
  return section
    .split("\n")
    .map((l) => l.replace(/^[\d.-]+\s*/, "").trim())
    .filter(Boolean);
}
