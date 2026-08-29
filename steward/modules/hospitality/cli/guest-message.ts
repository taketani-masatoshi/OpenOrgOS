import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getModuleById } from "../../../../src/lib/ops-config.js";
import { getDocsDir } from "../../../../src/lib/utils.js";
import { loadStays } from "./ops-lib.js";

export type GuestMessageTemplate = {
  id: string;
  path: string;
  title: string;
};

function templatesDir(): string | undefined {
  const mod = getModuleById("hospitality");
  if (!mod?.docs_root) return undefined;
  const root = mod.docs_root.replace(/^docs\//, "").replace(/\/$/, "");
  return join(getDocsDir(), root, "templates", "messages");
}

export function listGuestMessageTemplates(): GuestMessageTemplate[] {
  const dir = templatesDir();
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({
      id: name.replace(/\.md$/, ""),
      path: join(dir, name),
      title: name.replace(/\.md$/, ""),
    }));
}

function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

export function renderGuestMessage(
  templateId: string,
  stayId: string,
  extraVars: Record<string, string> = {}
): string {
  const dir = templatesDir();
  if (!dir) throw new Error("hospitality docs_root not configured");
  const path = join(dir, `${templateId}.md`);
  if (!existsSync(path)) {
    const alt = join(dir, templateId.endsWith(".md") ? templateId : `${templateId}.md`);
    if (!existsSync(alt)) throw new Error(`message template not found: ${templateId}`);
  }
  const filePath = existsSync(path) ? path : join(dir, `${templateId}.md`);
  const stay = loadStays().stays.find((s) => s.id === stayId);
  if (!stay) throw new Error(`stay not found: ${stayId}`);

  const vars: Record<string, string> = {
    stay_id: stay.id,
    check_in_date: stay.check_in,
    check_out_date: stay.check_out,
    guest_count: String(stay.party_size),
    booking_channel: stay.channel,
    reservation_id: stay.ota_ref ?? "",
    guest_name: "[guest_name]",
    access_code: "[access_code]",
    wifi_ssid: "[wifi_ssid]",
    wifi_password: "[wifi_password]",
    emergency_phone: "[emergency_phone]",
    map_link: "[map_link]",
    ...extraVars,
  };

  const raw = readFileSync(filePath, "utf-8");
  const sections = raw.split(/^---\s*$/m);
  const body = sections.length > 2 ? sections.slice(2).join("---") : raw;
  return substitute(body.trim(), vars);
}
