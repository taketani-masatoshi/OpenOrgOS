import { readFileSync } from "node:fs";
import { join } from "node:path";
import { medicalDeviceApplicationKind } from "../../../../../../schemas/jp-medical-device.js";
import { assessApplicationForDeviceId } from "../../../../../../src/lib/medical-device/application-completeness.js";
import { getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import {
  buildTemplateVars,
  fillTemplate,
  resolveTemplatePath,
} from "./shared.js";

const APPLICATION_KINDS = [
  {
    kind: "certification" as const,
    title: "認証申請チェックリスト（社内）",
    template: "templates/applications/certification-checklist.md",
  },
  {
    kind: "partial-change" as const,
    title: "一部変更申請チェックリスト（社内）",
    template: "templates/applications/partial-change-checklist.md",
  },
  {
    kind: "notification" as const,
    title: "届出チェックリスト（社内）",
    template: "templates/applications/notification-checklist.md",
  },
];

export function runJpMedicalDeviceApplicationCatalog(opts: { json?: boolean }): void {
  if (opts.json) {
    console.log(JSON.stringify(APPLICATION_KINDS, null, 2));
    return;
  }
  console.log("# 品目申請資料カタログ（社内ドラフト · 自動提出なし）\n");
  for (const k of APPLICATION_KINDS) {
    console.log(`- \`${k.kind}\` · ${k.title}`);
  }
}

export function runJpMedicalDeviceApplicationDraft(opts: {
  kind: string;
  deviceId?: string;
  write?: boolean;
  force?: boolean;
  json?: boolean;
}): void {
  const kind = medicalDeviceApplicationKind.parse(opts.kind);
  const meta = APPLICATION_KINDS.find((k) => k.kind === kind);
  if (!meta) {
    console.error(`Unknown kind: ${opts.kind}`);
    process.exit(1);
  }
  const completeness = assessApplicationForDeviceId(opts.deviceId, kind);
  if (!completeness.ok && !opts.force) {
    console.error(
      `✗ 申請ドラフト不可 — 品目必須フィールド不足: ${completeness.missing.join(", ")}`
    );
    for (const w of completeness.warnings) console.error(`  ! ${w}`);
    console.error("  hint: 実値を device-master に入れるか `--force`（デモ用）");
    process.exit(1);
  }
  if (!completeness.ok && opts.force) {
    console.log(`! --force: missing ${completeness.missing.join(", ")}`);
  }
  for (const w of completeness.warnings) {
    console.log(`! ${w}`);
  }
  const templatePath = resolveTemplatePath(meta.template);
  if (!templatePath) {
    console.error(`Template missing: ${meta.template}`);
    process.exit(1);
  }
  const raw = readFileSync(templatePath, "utf-8");
  const vars = buildTemplateVars(kind, opts.deviceId);
  const content = fillTemplate(raw, vars);
  const fileName = `${kind}-${(opts.deviceId ?? completeness.device?.id ?? "device").toLowerCase()}.md`;
  const outPath = join(getDocsDir(), "medical-device", "applications", fileName);
  if (opts.write) {
    writeTrackedFile(outPath, content);
    console.log(`Wrote ${outPath}`);
  }
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          path: outPath,
          kind,
          completeness,
        },
        null,
        2
      )
    );
    return;
  }
  if (!opts.write) {
    console.log(content);
    console.log("\n---\n`--write` で docs/medical-device/applications/ に保存 · 提出は人間");
  }
}

