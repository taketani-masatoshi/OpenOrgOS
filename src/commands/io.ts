import {
  addInboxItem,
  completeInboxItem,
  formatIoStatus,
  getIoStatus,
  INBOX_CATEGORIES,
  initDocumentIoFile,
  loadDocumentIo,
  markOutboxPrinted,
  OUTBOX_CATEGORIES,
  registerOutboxItem,
  syncOutboxFromDisk,
  type AddInboxOptions,
} from "../lib/document-io.js";
import type { InboxCategory, OutboxCategory } from "../../schemas/document-io.js";
import { writeMarkdownReport } from "../lib/utils.js";
import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";

export function runIoStatus(): void {
  initDocumentIoFile();
  console.log(formatIoStatus(getIoStatus(), loadDocumentIo()));
}

export function runIoInboxList(): void {
  initDocumentIoFile();
  const items = loadDocumentIo().inbox_items;
  if (!items.length) {
    console.log("Inbox: 項目なし");
    return;
  }
  console.log("ID\tStatus\tCategory\tTitle\tPath");
  console.log("-".repeat(80));
  for (const i of items) {
    console.log(`${i.id}\t${i.status}\t${i.category}\t${i.title}\t${i.path}`);
  }
}

export function runIoInboxAdd(opts: {
  from: string;
  category: string;
  title: string;
  source?: string;
  related?: string;
  notes?: string;
}): void {
  initDocumentIoFile();
  if (!INBOX_CATEGORIES.includes(opts.category as InboxCategory)) {
    throw new Error(`Invalid category. Use: ${INBOX_CATEGORIES.join(", ")}`);
  }
  const item = addInboxItem({
    from: opts.from,
    category: opts.category as InboxCategory,
    title: opts.title,
    source: opts.source as AddInboxOptions["source"],
    relatedId: opts.related,
    notes: opts.notes,
  });
  console.log(`✓ Inbox registered: ${item.id}`);
  console.log(`  → ${item.path}`);
}

export function runIoInboxDone(opts: {
  id: string;
  archive?: string;
  output?: string;
  notes?: string;
}): void {
  const item = completeInboxItem({
    id: opts.id,
    archiveTo: opts.archive,
    outputTo: opts.output,
    notes: opts.notes,
  });
  console.log(`✓ Inbox ${item.id} → done`);
  if (item.archive_path) console.log(`  保管: ${item.archive_path}`);
  if (item.output_path) console.log(`  出力: ${item.output_path}`);
}

export function runIoOutboxList(): void {
  initDocumentIoFile();
  const items = loadDocumentIo().outbox_items.filter((o) => !o.printed_at);
  if (!items.length) {
    console.log("Outbox: 印刷待ちなし");
    return;
  }
  console.log("ID\tPurpose\tCategory\tFile\tGenerated");
  console.log("-".repeat(80));
  for (const o of items) {
    console.log(`${o.id}\t${o.purpose}\t${o.category}\t${o.filename}\t${o.generated_at}`);
  }
}

export function runIoOutboxAdd(opts: {
  from: string;
  category: string;
  purpose?: string;
  title?: string;
  subdir?: string;
}): void {
  initDocumentIoFile();
  if (!OUTBOX_CATEGORIES.includes(opts.category as OutboxCategory)) {
    throw new Error(`Invalid category. Use: ${OUTBOX_CATEGORIES.join(", ")}`);
  }
  const item = registerOutboxItem({
    from: opts.from,
    category: opts.category as OutboxCategory,
    purpose: opts.purpose as "print" | "submit" | "display" | undefined,
    title: opts.title,
    subdir: opts.subdir,
  });
  console.log(`✓ Outbox registered: ${item.id} → ${item.path}`);
}

export function runIoOutboxPrinted(id: string): void {
  const item = markOutboxPrinted(id);
  console.log(`✓ ${item.id} marked printed (${item.printed_at})`);
}

export function runIoOutboxScan(): void {
  initDocumentIoFile();
  const added = syncOutboxFromDisk();
  if (!added.length) {
    console.log("✓ 未登録 PDF なし");
    return;
  }
  console.log(`✓ ${added.length} 件を outbox 台帳に登録:`);
  for (const o of added) console.log(`  ${o.id}  ${o.path}`);
}

export function runIoGuide(opts: { output?: string }): void {
  const md = `# Document I/O ガイド

## 受信（Input）→ \`docs/io/inbox/\`

| フォルダ | 置くもの |
|---------|---------|
| \`contracts/\` | 契約書原本・署名済 PDF |
| \`licenses/\` | 許認可・保険証券のスキャン |
| \`applications/\` | 申請書・届出 |
| \`receipts/\` | 領収書・請求書 |
| \`corporate/\` | 議事録署名版・登記関連 |
| \`misc/\` | その他 |

\`\`\`bash
npm run orgos -- io inbox add --from ~/Downloads/scan.pdf --category licenses --title "旅館業許可証"
npm run orgos -- io inbox done INB-001 --archive docs/company/licenses/ryokan/records/permit.pdf
\`\`\`

## 出力（Output）→ \`docs/io/outbox/\`

\`\`\`bash
npm run orgos -- report annual --fy FY2026
npm run orgos -- io outbox list
npm run orgos -- io outbox printed OUT-001
\`\`\`

台帳: \`data/document-io.yaml\`
`;
  if (opts.output) {
    requireCliReportWrite("io guide");
    console.log(`✓ Guide: ${writeMarkdownReport("io", opts.output, md)}`);
  } else {
    console.log(md);
  }
}
