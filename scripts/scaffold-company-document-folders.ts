/**
 * Scaffold company document folders under tenants/{id}/docs/
 * Usage: npx tsx scripts/scaffold-company-document-folders.ts southwood aiac
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTenantsDir } from "../src/lib/orgos-paths.js";

const DOC_DIRS = [
  "company/governance",
  "company/hr/templates",
  "company/licenses",
  "company/tax",
  "company/regulations",
  "company/events",
  "company/artifacts",
  "contracts",
  "procurement/quotes/received",
  "procurement/quotes/sent",
  "procurement/orders",
  "sales/quotes",
  "finance/accounting/invoices/issued",
  "finance/accounting/invoices/received",
  "finance/accounting/quotes",
  "finance/accounting/templates",
  "finance/accounting/records",
  "io/inbox",
  "io/outbox/sent",
  "legal",
  "compliance",
  "executive",
  "exports",
  "reports/agent-summaries",
  "reports/routing-queue",
];

const README: Record<string, string> = {
  "company/governance":
    "# company/governance — ガバナンス書類\n\n株主総会・取締役会議事録、決議書、委任状など。\n\n| 例 | パス |\n|----|------|\n| 取締役会議事録 | `governance/2026/torishimari-2026-07.md` |\n| 株主総会議事録 | `governance/2026/shukai-2026.md` |\n",
  "company/hr/templates":
    "# company/hr — 人事書類\n\n雇用契約テンプレ、就業規則、名簿 CSV など（L2 個人票は records/）。\n",
  "company/licenses":
    "# company/licenses — 許認可・登記\n\n登記簿謄本索引、許認可証、定款写しの所在。\n",
  "company/tax":
    "# company/tax — 税務書類\n\n法人税・消費税申告の要約 MD。詳細 PDF は records/。\n",
  "company/regulations":
    "# company/regulations — 社内規程\n\nREG-* 施行文。正本テンプレ: steward/jurisdiction-packs/JP/regulations/templates/\n",
  "procurement/quotes/received":
    "# procurement/quotes/received — 受領見積\n\nベンダー・相手社から受け取った見積書。`{ベンダー名}/QUO-YYYYMMDD-*.md`\n",
  "procurement/quotes/sent":
    "# procurement/quotes/sent — 見積依頼・RFQ 送付\n\n見積依頼の送付記録。\n",
  "procurement/orders": "# procurement/orders — 発注書\n\nPO・発注書。稟議承認後に格納。\n",
  "sales/quotes":
    "# sales/quotes — 提出見積\n\n顧客・委託者向けに提出した見積書。`{相手先}/QUO-YYYYMMDD-*.md`\n",
  "finance/accounting/invoices/issued":
    "# invoices/issued — 発行請求書\n\n自社が発行した請求書の索引・要約 MD。\n",
  "finance/accounting/invoices/received":
    "# invoices/received — 受領請求書\n\nベンダー請求書。`{ベンダー}/{YYYY-MM}/`\n",
  "finance/accounting/quotes":
    "# finance/accounting/quotes — 経理保管見積\n\n会計処理に紐づく見積の索引（任意）。\n",
  "finance/accounting/templates":
    "# finance/accounting/templates — 経理台帳テンプレ\n\n経費精算台帳・領収書索引 CSV 等。\n",
  "finance/accounting/records":
    "# records — スキャン原本（非追跡推奨）\n\nPDF・画像の正本。Git 外 `records/` または `.gitignore` 配下。\n",
  "io/inbox":
    "# io/inbox — 外部受領\n\n未分類の受領書類・組織間契約ドラフト（相手送付）。\n\n組織間契約: [inter-org-contract-workflow.md](../../../../steward/rules/inter-org-contract-workflow.md)\n",
  "io/outbox/sent": "# io/outbox/sent — 送付控え\n\nメール送付した契約・見積の控え。\n",
  legal: "# docs/legal — 法務\n\nリーガルメモ、契約レビュー、NDA ドラフト（契約台帳外）。\n",
  compliance: "# docs/compliance — コンプライアンス\n\nISO、プライバシー、内部監査。\n",
  executive: "# docs/executive — 役員・秘書\n\nスケジュール、1on1、対外下書き。\n",
  exports: "# docs/exports — CSV エクスポート\n\n`orgos sync` 生成物。\n",
  contracts:
    "# docs/contracts — 契約書\n\n`CTR-XXX/01-draft.md` · `02-executed.md`。台帳: `data/contracts/`。\n\n組織間: [inter-org-contract-workflow.md](../../../../steward/rules/inter-org-contract-workflow.md)\n",
};

function scaffoldTenant(tenantId: string): void {
  const base = join(getTenantsDir(), tenantId, "docs");
  if (!existsSync(join(getTenantsDir(), tenantId))) {
    console.error(`Skip ${tenantId}: tenant not found`);
    return;
  }
  mkdirSync(base, { recursive: true });
  let created = 0;
  for (const rel of DOC_DIRS) {
    const dir = join(base, rel);
    mkdirSync(dir, { recursive: true });
    const readmePath = join(dir, "00-このフォルダについて.md");
    if (!existsSync(readmePath) && README[rel]) {
      writeFileSync(readmePath, README[rel], "utf-8");
      created++;
    }
  }
  const indexPath = join(base, "00-このフォルダについて.md");
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, tenantIndex(tenantId), "utf-8");
    created++;
  }
  const recordsDir = join(getTenantsDir(), tenantId, "records");
  mkdirSync(recordsDir, { recursive: true });
  const recordsReadme = join(recordsDir, "00-このフォルダについて.md");
  if (!existsSync(recordsReadme)) {
    writeFileSync(
      recordsReadme,
      `# records — スキャン原本（L2）\n\nPDF・画像の正本。Git 非追跡推奨。\n\n| 種別 | 例 |\n|------|-----|\n| 契約 | records/contracts/{YYYY}/ |\n| 見積 | records/quotes/{YYYY}/ |\n| 領収書 | records/receipts/{YYYY}/ |\n\n索引は docs/ 側の MD・CSV に L1 のみ記載。\n`,
      "utf-8"
    );
    created++;
  }
  console.log(`✓ ${tenantId}: scaffolded (${created} new README/index files)`);
}

function tenantIndex(tenantId: string): string {
  return `# docs/ — 会社書類（${tenantId}）

人が読む・印刷・提出する書類。数値正本は [\`data/\`](../data/)。

**レイアウト正本:** [steward/rules/company-document-layout.md](../../../steward/rules/company-document-layout.md)

## フォルダ一覧

| フォルダ | 用途 |
|----------|------|
| [company/](company/) | 法人 · 規程 · 議事録 · HR · 許認可 · 税務 · events |
| [contracts/](contracts/) | 契約書（CTR-XXX） |
| [procurement/](procurement/) | 調達 · **受領見積** · 発注書 |
| [sales/](sales/) | **提出見積** |
| [finance/accounting/](finance/accounting/) | 請求書 · 経理台帳 · スキャン索引 |
| [io/](io/) | 外部受領（inbox）· 送付控え（outbox） |
| [legal/](legal/) | 法務メモ |
| [compliance/](compliance/) | コンプライアンス |
| [executive/](executive/) | 秘書・役員 |
| [exports/](exports/) | CSV |
| [reports/](reports/) | CLI / Agent 生成 |

## 見積書の置き場所

| 状況 | パス |
|------|------|
| 相手からもらった見積 | \`procurement/quotes/received/\` |
| 自社が出した見積 | \`sales/quotes/\` |

## スキャン原本

[\`records/\`](../records/) — PDF 正本（Git 非追跡推奨）
`;
}

const tenants = process.argv.slice(2);
if (!tenants.length) {
  console.error("Usage: npx tsx scripts/scaffold-company-document-folders.ts <tenant-id> ...");
  process.exit(1);
}
for (const id of tenants) scaffoldTenant(id);
