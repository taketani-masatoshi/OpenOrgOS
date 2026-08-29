#!/usr/bin/env node
/**
 * JP 許認可カタログ拡充ヘルパー（再実行可 · idempotent）。
 *
 * - NEW 配列の種別を permit-types.csv に追記
 * - 条件未整備の種別に obtain 3 ステップを生成
 * - YAML カタログを CSV から再同期
 *
 * Usage:
 *   node --import tsx scripts/expand-jp-permit-catalog.ts
 *   node --import tsx scripts/expand-jp-permit-catalog.ts --sync-yaml-only
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CAT = path.join(ROOT, "steward/jurisdiction-packs/JP/modules/jp_permit_registry/catalog");
const SEED = path.join(ROOT, "steward/jurisdiction-packs/JP/modules/jp_permit_registry/seed");

/** 追加種別は会話実装時に投入済み。再実行時は既存 ID をスキップ。 */
const NEW: Array<Record<string, string | boolean | undefined>> = [];

function syncYamlFromCsv(): number {
  const typesPath = path.join(CAT, "permit-types.csv");
  const typesCsv = fs.readFileSync(typesPath, "utf-8").trim().split(/\n/);
  const headers = typesCsv[0]!.split(",");
  const rows = typesCsv.slice(1).filter(Boolean).map((line) => {
    const cols: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
        continue;
      }
      if (ch === "," && !q) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    const o: Record<string, string> = {};
    headers.forEach((h, i) => (o[h!] = cols[i] ?? ""));
    return o;
  });

  const sectorMeta: Record<string, { name_ja: string; name_en?: string; notes?: string }> = {
    accommodation: { name_ja: "宿泊・民泊" },
    fire_building: { name_ja: "消防・建築" },
    food_beverage: { name_ja: "飲食・酒類" },
    real_estate: { name_ja: "不動産" },
    construction: { name_ja: "建設" },
    transport: { name_ja: "運送・交通" },
    travel: { name_ja: "旅行業", notes: "旅行業法" },
    medical_health: {
      name_ja: "医療機器・薬事",
      notes: "薬機法 · 詳細義務は jp_medical_device も参照",
    },
    pharmacy_clinic: { name_ja: "医療・薬局" },
    finance: { name_ja: "金融・決済", notes: "金商法1種・2種含む" },
    labor: { name_ja: "労働・人材" },
    waste_environment: { name_ja: "廃棄物・環境" },
    security: { name_ja: "警備・探偵" },
    telecom_media: { name_ja: "電気通信・放送" },
    import_export: { name_ja: "輸出入・通関" },
    entertainment: { name_ja: "風営・娯楽" },
    retail: { name_ja: "小売・古物" },
    welfare_care: { name_ja: "介護・福祉" },
    education: { name_ja: "教育・学習" },
    agriculture: { name_ja: "農林水産" },
    energy: { name_ja: "エネルギー" },
    animal: { name_ja: "動物取扱・獣医" },
    childcare: { name_ja: "保育・児童" },
    other: { name_ja: "その他届出・士業法人" },
  };

  const cats = [...new Set(rows.map((r) => r.category!))];
  const yamlDoc = {
    jurisdiction: "JP",
    updated: new Date().toISOString().slice(0, 10),
    catalog_version: "2",
    sectors: cats.map((id) => ({ id, ...(sectorMeta[id] ?? { name_ja: id }) })),
    permit_types: rows.map((r) => ({
      id: r.permit_type_id,
      category: r.category,
      name_ja: r.name_ja,
      ...(r.name_en ? { name_en: r.name_en } : {}),
      legal_basis: r.legal_basis,
      issuer_type: r.issuer_type,
      ...(r.issuer_label_ja ? { issuer_label_ja: r.issuer_label_ja } : {}),
      ...(r.renewal_cycle ? { renewal_cycle: r.renewal_cycle } : {}),
      property_scoped: r.property_scoped === "true",
      site_scoped: r.site_scoped === "true",
      ...(r.binds_module ? { binds_module: r.binds_module } : {}),
      ...(r.notes ? { notes: r.notes } : {}),
    })),
  };

  const yamlPath = path.join(SEED, "permit-types-catalog.yaml.example");
  fs.writeFileSync(yamlPath, `# 生成: scripts/expand-jp-permit-catalog.ts（CSV 正本から同期）\n` + YAML.stringify(yamlDoc));
  const malYaml = path.join(ROOT, "tenants/mal/data/permit-registry/permit-types-catalog.yaml");
  if (fs.existsSync(path.dirname(malYaml))) {
    fs.writeFileSync(malYaml, YAML.stringify(yamlDoc));
  }
  return rows.length;
}

if (process.argv.includes("--sync-yaml-only") || NEW.length === 0) {
  const n = syncYamlFromCsv();
  console.log(`✓ YAML synced from CSV (${n} types)`);
  if (NEW.length === 0 && !process.argv.includes("--sync-yaml-only")) {
    console.log("（追加種別なし — 新規は NEW 配列に定義して再実行）");
  }
} else {
  console.log("NEW entries present — append logic reserved; use catalog CSV edits or prior expand");
  syncYamlFromCsv();
}
