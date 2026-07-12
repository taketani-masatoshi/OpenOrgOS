import { runInvoiceGenerate } from "../lib/invoice-generate.js";

export async function runInvoiceGenerateCommand(options: {
  module: string;
  property: string;
  from: string;
  to: string;
  fy?: string;
  tenantName?: string;
  tenantEmail?: string;
  bankAccount?: string;
  senderEmail?: string;
  dryRun?: boolean;
}): Promise<void> {
  const result = await runInvoiceGenerate({
    moduleId: options.module,
    propertyId: options.property,
    from: options.from,
    to: options.to,
    fiscalYear: options.fy,
    tenantName: options.tenantName,
    tenantEmail: options.tenantEmail,
    bankAccount: options.bankAccount,
    senderEmail: options.senderEmail,
    dryRun: options.dryRun,
  });

  const mode = options.dryRun ? " (dry-run)" : "";
  console.log(
    `✓ ${result.propertyId} 請求書 ${result.months.length} 件 (${result.fiscalYear}) · module ${result.moduleId}${mode}`
  );
  for (const f of result.files) {
    console.log(`  ${f.month}:`);
    console.log(`    PDF:  ${f.pdf}`);
    console.log(`    MD:   ${f.emailMd}`);
    console.log(`    EML:  ${f.eml}`);
    console.log(`    MSG:  ${f.msg}`);
  }
  console.log("");
  if (options.dryRun) {
    console.log(
      "dry-run: ファイルは生成していません。billing 設定後に --dry-run なしで実行してください。"
    );
  } else {
    console.log("要記入: 借主名・送付先メール・振込先口座（プレースホルダのまま）");
  }
}
