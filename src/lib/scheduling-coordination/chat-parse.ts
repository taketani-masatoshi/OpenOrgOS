import { z } from "zod";
import { resolveContactRegistry } from "../secretary/contact-registry.js";

const SCHEDULE_INTENT =
  /(?:日程|スケジュール).{0,8}(?:調整|合わせ)|(?:\d+)\s*名.{0,12}(?:日程|調整|会議|MTG|打合せ)|(?:会議|MTG|打合せ).{0,8}(?:調整|設定)/i;

const COUNT_PATTERN = /(\d+)\s*名/;
const TITLE_PATTERNS = [
  /「([^」]+)」.{0,12}(?:日程|調整)/,
  /(?:日程調整|スケジュール調整)[：:]\s*([^。\n]+)/,
  /(?:会議|MTG|打合せ)[「『:]([^」』。\n]+)/i,
  /(?:^|[、。\s])([^、。\n]{2,40}?)(?:の)?(?:日程|スケジュール)(?:調整|を調整)/,
];

export const schedulingChatParticipantSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  contact_ref: z.string().optional(),
  role: z.enum(["internal", "external"]).default("external"),
});

export function isSchedulingChatIntent(message: string): boolean {
  return SCHEDULE_INTENT.test(message.trim());
}

export function normalizeSchedulingChatMessage(message: string): string {
  return message.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function extractSchedulingChatTitle(message: string): string | undefined {
  for (const p of TITLE_PATTERNS) {
    const m = message.match(p);
    if (m?.[1]?.trim()) {
      return m[1]
        .replace(/^\d+\s*名で?/, "")
        .trim()
        .slice(0, 80);
    }
  }
  return undefined;
}

export function extractSchedulingChatContinuationTitle(message: string): string | undefined {
  const first = message.split(/[\n,、;；]/u)[0]?.trim();
  if (
    !first ||
    first.length > 80 ||
    /@|\b(?:EXT|STK)-\d+\b|(?:参加者|出席者|メンバー|所要|オンライン|対面)/iu.test(first)
  ) {
    return undefined;
  }
  return first.replace(/^(?:タイトル|件名)(?:は|：|:)?\s*/u, "").trim() || undefined;
}

export function extractSchedulingChatParticipantCount(message: string): number | undefined {
  const m = message.match(COUNT_PATTERN);
  if (m) return Math.min(Math.max(parseInt(m[1]!, 10), 2), 12);
  return undefined;
}

export function extractSchedulingChatDuration(message: string): number | undefined {
  const hours = message.match(/(\d+(?:\.\d+)?)\s*時間/);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const minutes = message.match(/(\d+)\s*分/);
  if (minutes) return Number(minutes[1]);
  return undefined;
}

export function extractSchedulingChatMeetingFormat(
  message: string
): "online" | "in_person" | undefined {
  if (/(?:オンライン|online|zoom|meet|teams|web会議)/i.test(message)) return "online";
  if (/(?:対面|訪問|来社|会議室|in[\s-]?person)/i.test(message)) return "in_person";
  return undefined;
}

export function extractSchedulingChatLocation(message: string): string | undefined {
  return message
    .match(/(?:場所|会場)(?:は|：|:)\s*([^、。\n]+)/u)?.[1]
    ?.trim()
    .slice(0, 120);
}

function cleanParticipantName(raw: string): string {
  const afterLabel = raw.split(/(?:参加者|出席者|メンバー)(?:は|：|:)\s*/u).at(-1) ?? raw;
  return afterLabel
    .replace(/^.*[。]\s*/u, "")
    .replace(/[<（(\[]+$/u, "")
    .replace(/(?:さん|様)$/u, "")
    .trim();
}

export function extractSchedulingChatParticipants(
  message: string
): Array<z.output<typeof schedulingChatParticipantSchema>> {
  const found: Array<z.output<typeof schedulingChatParticipantSchema>> = [];
  const segments = message.split(/[\n,、;；]+/u);
  for (const segment of segments) {
    const email = segment.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    const contactRef = segment.match(/\b(?:EXT|STK)-\d+\b/i)?.[0]?.toUpperCase();
    if (!email && !contactRef) continue;
    const marker = email ?? contactRef!;
    const before = segment.slice(0, segment.indexOf(marker));
    const name = cleanParticipantName(before.replace(/[<（(\[]\s*$/u, ""));
    if (!name || /(?:日程|調整|所要|形式|オンライン|対面)/u.test(name)) continue;

    let resolvedEmail = email;
    let resolvedRef = contactRef;
    if (contactRef) {
      const lookup = contactRef.startsWith("EXT-")
        ? resolveContactRegistry({ extId: contactRef })
        : resolveContactRegistry({ stakeholderId: contactRef });
      if (lookup.matches.length === 1) {
        resolvedEmail ??= lookup.matches[0]!.email;
        resolvedRef = lookup.matches[0]!.ref;
      }
    }
    found.push({
      name,
      email: resolvedEmail,
      contact_ref: resolvedRef,
      role: "external",
    });
  }
  return found.filter(
    (participant, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.email?.toLowerCase() === participant.email?.toLowerCase() &&
          candidate.contact_ref === participant.contact_ref &&
          candidate.name === participant.name
      ) === index
  );
}
