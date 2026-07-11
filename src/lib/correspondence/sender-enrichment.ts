import type { WebSearchHit } from "../../../schemas/correspondence/sender-identification.js";

export interface WebSearchResult {
  query: string;
  hits: WebSearchHit[];
  note?: string;
}

/** DuckDuckGo Instant Answer API（API キー不要 · L1 要約のみ） */
export async function searchWebForSender(opts: {
  displayName?: string;
  email: string;
  orgHint?: string;
}): Promise<WebSearchResult> {
  const localPart = opts.email.split("@")[0] ?? "";
  const domain = opts.email.split("@")[1] ?? "";
  const parts = [opts.displayName, opts.orgHint, domain !== "gmail.com" ? domain : undefined]
    .filter(Boolean)
    .join(" ");
  const query = parts.trim() || localPart;

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "OrgOS-MailIntake/1.0" },
    });
    if (!res.ok) {
      return { query, hits: [], note: `search HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };

    const hits: WebSearchHit[] = [];
    if (data.AbstractText) {
      hits.push({
        title: data.Heading ?? query,
        snippet: data.AbstractText.slice(0, 500),
        url: data.AbstractURL,
      });
    }
    for (const topic of data.RelatedTopics ?? []) {
      if (!topic.Text) continue;
      hits.push({
        title: topic.Text.slice(0, 120),
        snippet: topic.Text.slice(0, 500),
        url: topic.FirstURL,
      });
      if (hits.length >= 5) break;
    }

    return {
      query,
      hits,
      note:
        hits.length === 0
          ? "検索結果なし — CEO への質問が必要"
          : "Web 検索は参考情報のみ。CEO 確認必須",
    };
  } catch (err) {
    return {
      query,
      hits: [],
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

export function formatWebSearchSummary(result: WebSearchResult): string {
  const lines = [`検索クエリ: ${result.query}`, ""];
  if (!result.hits.length) {
    lines.push("（ヒットなし）");
  } else {
    for (const h of result.hits.slice(0, 3)) {
      lines.push(`- ${h.title}`);
      lines.push(`  ${h.snippet}`);
      if (h.url) lines.push(`  ${h.url}`);
    }
  }
  if (result.note) lines.push("", `※ ${result.note}`);
  return lines.join("\n");
}
