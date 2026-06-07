import { runBanchoInvoices } from "../lib/invoice-bancho.js";

export async function runInvoiceBancho(options: {
  from: string;
  to: string;
  fy?: string;
  tenantName?: string;
  tenantEmail?: string;
  bankAccount?: string;
}): Promise<void> {
  const result = await runBanchoInvoices({
    from: options.from,
    to: options.to,
    fiscalYear: options.fy,
    tenantName: options.tenantName,
    tenantEmail: options.tenantEmail,
    bankAccount: options.bankAccount,
  });

  console.log(`✓ 番町ハイム312 請求書 ${result.months.length} 件 (${result.fiscalYear})`);
  for (const f of result.files) {
    console.log(`  ${f.month}:`);
    console.log(`    PDF:  ${f.pdf}`);
    console.log(`    MD:   ${f.emailMd}`);
    console.log(`    EML:  ${f.eml}`);
    console.log(`    MSG:  ${f.msg}`);
  }
  console.log("");
  console.log("要記入: 借主名・送付先メール・振込先口座（プレースホルダのまま）");
}
