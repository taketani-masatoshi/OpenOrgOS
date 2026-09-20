import type {
  PlatformListingQuestion,
  ReachAudience,
  ReachProposal,
  ReachProposalResult,
} from "../../../../schemas/talent-hiring.js";

const PROPOSALS: Record<ReachAudience, ReachProposal[]> = {
  women: [
    { id: "baitona_joshi", name: "バイトな女子", why: "来訪者が女性に偏る。原稿は男女不問のまま出す" },
    { id: "townwork", name: "タウンワーク", why: "女性の利用者数が多い" },
    { id: "baitoru", name: "バイトル", why: "女性の割合が約6割" },
  ],
  twenties: [
    { id: "timee", name: "タイミー", why: "10〜30代の利用が厚い。1日単位の仕事向き" },
    { id: "baitoru", name: "バイトル", why: "応募者に若い層が多い" },
  ],
};

const WITHHELD = [
  "求人票に年齢・性別を書かない",
  "来た人を年齢・性別では落とさない",
];

function audiencesFromWish(wish: string): ReachAudience[] {
  const found: ReachAudience[] = [];
  if (/女/.test(wish)) found.push("women");
  if (/20\s*代|二十代|２０代/.test(wish)) found.push("twenties");
  return found;
}

function question(): PlatformListingQuestion {
  return {
    field: "audience",
    prompt: "届いてほしい層はどれですか。求人票には書きません。",
    options: [
      { id: "women", label: "女性の応募を増やしたい" },
      { id: "twenties", label: "20代に届きやすくしたい" },
    ],
  };
}

export function proposeReach(input: unknown): ReachProposalResult {
  const wish = typeof input === "string"
    ? input
    : input && typeof input === "object" && !Array.isArray(input) && typeof (input as { wish?: unknown }).wish === "string"
      ? (input as { wish: string }).wish
      : "";
  if (!wish.trim()) return { status: "need_answers", questions: [question()] };

  const audiences = audiencesFromWish(wish);
  if (audiences.length === 0) return { status: "need_answers", questions: [question()] };

  const seen = new Set<string>();
  const proposals: ReachProposal[] = [];
  for (const audience of audiences) {
    for (const row of PROPOSALS[audience]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      proposals.push(row);
    }
  }
  return { status: "ready", audiences, proposals, withheld: WITHHELD };
}
