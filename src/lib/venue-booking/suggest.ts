import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import {
  partyLocationsFileSchema,
  type PartyLocationAnchor,
  type PartyLocationsFile,
} from "../../../schemas/party-locations.js";
import type { VenueCatalogEntry } from "../../../schemas/venue-booking.js";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { resolveTenantPath } from "../utils.js";
import { loadVenueCatalog } from "./store.js";
import { schedulingCaseLooksLikeMeal } from "../scheduling-coordination/draft-text.js";

export const PARTY_LOCATIONS_REL = "data/operations/party-locations.yaml";

/** Built-in Tokyo central clusters (minutes · undirected) */
const DEFAULT_CLUSTER_MINUTES: Record<string, Record<string, number>> = {
  "chiyoda-west": {
    "chiyoda-west": 8,
    marunouchi: 15,
    "ginza-shimbashi": 22,
    nihonbashi: 25,
    kanda: 18,
    shirokane: 28,
    "ueno-east": 30,
    other: 40,
  },
  marunouchi: {
    "chiyoda-west": 15,
    marunouchi: 8,
    "ginza-shimbashi": 12,
    nihonbashi: 14,
    kanda: 12,
    shirokane: 25,
    "ueno-east": 22,
    other: 40,
  },
  "ginza-shimbashi": {
    "chiyoda-west": 22,
    marunouchi: 12,
    "ginza-shimbashi": 8,
    nihonbashi: 18,
    kanda: 20,
    shirokane: 18,
    "ueno-east": 28,
    other: 40,
  },
  nihonbashi: {
    "chiyoda-west": 25,
    marunouchi: 14,
    "ginza-shimbashi": 18,
    nihonbashi: 8,
    kanda: 12,
    shirokane: 30,
    "ueno-east": 18,
    other: 40,
  },
  kanda: {
    "chiyoda-west": 18,
    marunouchi: 12,
    "ginza-shimbashi": 20,
    nihonbashi: 12,
    kanda: 8,
    shirokane: 32,
    "ueno-east": 12,
    other: 40,
  },
  shirokane: {
    "chiyoda-west": 28,
    marunouchi: 25,
    "ginza-shimbashi": 18,
    nihonbashi: 30,
    kanda: 32,
    shirokane: 8,
    "ueno-east": 40,
    other: 35,
  },
  "ueno-east": {
    "chiyoda-west": 30,
    marunouchi: 22,
    "ginza-shimbashi": 28,
    nihonbashi: 18,
    kanda: 12,
    shirokane: 40,
    "ueno-east": 8,
    other: 35,
  },
  other: {
    "chiyoda-west": 40,
    marunouchi: 40,
    "ginza-shimbashi": 40,
    nihonbashi: 40,
    kanda: 40,
    shirokane: 35,
    "ueno-east": 35,
    other: 35,
  },
};

const DEFAULT_STATION_CLUSTER: Record<string, string> = {
  麹町: "chiyoda-west",
  半蔵門: "chiyoda-west",
  永田町: "chiyoda-west",
  四ツ谷: "chiyoda-west",
  市ヶ谷: "chiyoda-west",
  東京: "marunouchi",
  大手町: "marunouchi",
  丸の内: "marunouchi",
  有楽町: "marunouchi",
  銀座: "ginza-shimbashi",
  新橋: "ginza-shimbashi",
  汐留: "ginza-shimbashi",
  日比谷: "ginza-shimbashi",
  日本橋: "nihonbashi",
  人形町: "nihonbashi",
  茅場町: "nihonbashi",
  神田: "kanda",
  秋葉原: "kanda",
  白金高輪: "shirokane",
  白金台: "shirokane",
  目黒: "shirokane",
  新御徒町: "ueno-east",
  仲御徒町: "ueno-east",
  御徒町: "ueno-east",
  上野: "ueno-east",
  稲荷町: "ueno-east",
  品川: "other",
};

export function getPartyLocationsPath(): string {
  return resolveTenantPath(PARTY_LOCATIONS_REL);
}

export function loadPartyLocations(): PartyLocationsFile | undefined {
  const path = getPartyLocationsPath();
  if (!existsSync(path)) return undefined;
  const raw = parseYaml(readFileSync(path, "utf8"));
  return partyLocationsFileSchema.parse(raw ?? {});
}

export type VenueSuggestTiming = "day" | "evening";

export interface VenueSuggestOptions {
  caseRow?: SchedulingCase;
  /** Override timing (default: evening for meal-like in_person) */
  timing?: VenueSuggestTiming;
  limit?: number;
}

export interface VenueSuggestion {
  venue_id: string;
  name: string;
  area: string;
  station?: string;
  score: number;
  /** L1 explanation — station labels only */
  rationale: string;
  facts: string;
  first_pick: boolean;
}

function resolveCluster(
  station: string | undefined,
  file: PartyLocationsFile | undefined
): string {
  if (!station) return "other";
  const fromFile = file?.station_clusters?.[station];
  if (fromFile) return fromFile;
  return DEFAULT_STATION_CLUSTER[station] ?? "other";
}

function clusterTransitMinutes(a: string, b: string): number {
  return DEFAULT_CLUSTER_MINUTES[a]?.[b] ?? DEFAULT_CLUSTER_MINUTES.other?.other ?? 40;
}

function anchorMatchesParticipant(
  anchor: PartyLocationAnchor,
  participant: { email?: string; name?: string; contact_ref?: string }
): boolean {
  if (anchor.email && participant.email && anchor.email.toLowerCase() === participant.email.toLowerCase()) {
    return true;
  }
  if (
    anchor.contact_ref &&
    participant.contact_ref &&
    anchor.contact_ref === participant.contact_ref
  ) {
    return true;
  }
  if (anchor.email_domains?.length && participant.email) {
    const domain = participant.email.split("@")[1]?.toLowerCase();
    if (domain && anchor.email_domains.some((d) => d.toLowerCase() === domain)) {
      return true;
    }
  }
  if (anchor.org_hint && participant.name?.includes(anchor.org_hint)) {
    return true;
  }
  return false;
}

function selectAnchorsForCase(
  file: PartyLocationsFile,
  caseRow: SchedulingCase | undefined
): PartyLocationAnchor[] {
  const selected: PartyLocationAnchor[] = [];
  for (const anchor of file.parties) {
    if (anchor.party_kind === "self_company" || anchor.party_kind === "self_operator") {
      selected.push(anchor);
      continue;
    }
    if (!caseRow) {
      if (anchor.party_kind === "counterparty_org") selected.push(anchor);
      continue;
    }
    const hit = caseRow.participants.some((p) => anchorMatchesParticipant(anchor, p));
    if (hit) selected.push(anchor);
  }
  if (!selected.some((a) => a.party_kind === "self_company")) {
    const selfOffice = file.parties.find((a) => a.party_kind === "self_company");
    if (selfOffice) selected.push(selfOffice);
  }
  return selected;
}

function partyBestMinutesToVenue(
  anchors: PartyLocationAnchor[],
  venueCluster: string,
  timing: VenueSuggestTiming,
  file: PartyLocationsFile | undefined
): { minutes: number; used: PartyLocationAnchor } | undefined {
  if (!anchors.length) return undefined;
  let best: { minutes: number; used: PartyLocationAnchor } | undefined;
  for (const anchor of anchors) {
    const weight = timing === "evening" ? anchor.weight_evening : anchor.weight_day;
    const fromCluster = resolveCluster(anchor.station, file);
    const base = clusterTransitMinutes(fromCluster, venueCluster);
    const weighted = base / weight;
    if (!best || weighted < best.minutes) {
      best = { minutes: weighted, used: anchor };
    }
  }
  return best;
}

function groupAnchorsByParty(anchors: PartyLocationAnchor[]): PartyLocationAnchor[][] {
  const groups = new Map<string, PartyLocationAnchor[]>();
  for (const a of anchors) {
    const key =
      a.email ??
      a.contact_ref ??
      a.operator_id ??
      (a.party_kind === "self_company" || a.party_kind === "self_operator"
        ? `self:${a.role}`
        : a.org_hint ?? a.id);
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }
  // Merge self office + home into one "self" party for min(office,home)
  const selfKeys = [...groups.keys()].filter((k) => k.startsWith("self:"));
  if (selfKeys.length > 1) {
    const merged: PartyLocationAnchor[] = [];
    for (const k of selfKeys) {
      merged.push(...(groups.get(k) ?? []));
      groups.delete(k);
    }
    groups.set("self", merged);
  }
  return [...groups.values()];
}

function buildFacts(entry: VenueCatalogEntry): string {
  const parts: string[] = [];
  if (entry.station) {
    const walk =
      entry.walking_minutes_from_station != null
        ? `徒歩${entry.walking_minutes_from_station}分`
        : undefined;
    parts.push(walk ? `${entry.station}駅${walk}` : `${entry.station}駅`);
  } else if (entry.area) {
    parts.push(entry.area);
  }
  if (entry.private_room) parts.push("個室あり");
  return parts.join(" · ") || entry.area;
}

/**
 * Rank catalog venues by estimated transit convenience for party location anchors.
 * Does not call external maps APIs — deterministic cluster table.
 * Never returns street addresses.
 */
export function suggestVenuesForParties(opts: VenueSuggestOptions = {}): {
  timing: VenueSuggestTiming;
  anchors_used: Array<{ id: string; station: string; role: string; party_kind: string }>;
  suggestions: VenueSuggestion[];
  missing_party_locations: boolean;
} {
  const catalog = loadVenueCatalog();
  if (!catalog?.venues.length) {
    return {
      timing: opts.timing ?? "day",
      anchors_used: [],
      suggestions: [],
      missing_party_locations: true,
    };
  }

  const file = loadPartyLocations();
  const timing: VenueSuggestTiming =
    opts.timing ??
    (opts.caseRow &&
    (schedulingCaseLooksLikeMeal(opts.caseRow) || opts.caseRow.meeting_format === "in_person")
      ? "evening"
      : "day");

  const anchors = file ? selectAnchorsForCase(file, opts.caseRow) : [];
  const parties = groupAnchorsByParty(anchors);
  const limit = opts.limit ?? 3;

  const scored = catalog.venues.map((venue) => {
    const venueCluster = resolveCluster(venue.station ?? venue.area, file);
    let total = 0;
    const bits: string[] = [];
    for (const partyAnchors of parties) {
      const best = partyBestMinutesToVenue(partyAnchors, venueCluster, timing, file);
      if (best) {
        total += best.minutes;
        bits.push(`${best.used.station}→${venue.station ?? venue.area}`);
      }
    }
    total += venue.walking_minutes_from_station ?? 5;
    if (!parties.length) {
      // No anchors: prefer catalog order with mild station presence bias
      total = 50 + (venue.walking_minutes_from_station ?? 10);
    }
    return {
      venue,
      score: Math.round(total * 10) / 10,
      rationale: bits.length
        ? `移動目安（駅クラスタ）: ${bits.join(" · ")} · ${timing}`
        : "party-locations 未設定のためカタログ順",
    };
  });

  scored.sort((a, b) => a.score - b.score || a.venue.id.localeCompare(b.venue.id));
  const top = scored.slice(0, limit);
  const suggestions: VenueSuggestion[] = top.map((row, index) => ({
    venue_id: row.venue.id,
    name: row.venue.name,
    area: row.venue.area,
    station: row.venue.station,
    score: row.score,
    rationale: row.rationale,
    facts: buildFacts(row.venue),
    first_pick: index === 0,
  }));

  return {
    timing,
    anchors_used: anchors.map((a) => ({
      id: a.id,
      station: a.station,
      role: a.role,
      party_kind: a.party_kind,
    })),
    suggestions,
    missing_party_locations: !file || !anchors.length,
  };
}

/** Format CEO / clarify option lines from suggestions */
export function formatVenueSuggestionLines(suggestions: VenueSuggestion[]): {
  firstPick: string;
  optionA: string;
  optionB: string;
  optionC: string;
} {
  const [a, b, c] = suggestions;
  const line = (s?: VenueSuggestion) =>
    s ? `${s.name} — ${s.facts}` : "（候補不足 — カタログを追加）";
  return {
    firstPick: a?.name ?? "",
    optionA: line(a),
    optionB: line(b),
    optionC: line(c),
  };
}
