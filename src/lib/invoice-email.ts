import { readFileSync, writeFileSync } from "node:fs";
import * as msg from "@independentsoft/msg";
import {
  formatJapaneseDate,
  formatJapaneseYearMonth,
  paymentDueDate,
} from "./invoice-dates.js";

export const TENANT_NAME_PLACEHOLDER = "[借主名 TBD]";
export const TENANT_EMAIL_PLACEHOLDER = "[送付先メール TBD]";
export const BANK_ACCOUNT_PLACEHOLDER = "[振込先口座 TBD]";

import type { InvoiceTemplate } from "../../schemas/invoice-template.js";
import type { TemplateVars } from "./invoice-config.js";
import { interpolateTemplate } from "./invoice-config.js";

export interface RentInvoiceEmailInput {
  billingMonth: string;
  propertyName: string;
  tenantName: string;
  tenantEmail: string;
  companyName: string;
  senderEmail: string;
  monthlyRent: number;
  template?: InvoiceTemplate;
  bodyTemplateText?: string;
  templateVars?: TemplateVars;
}

export function buildInvoiceEmailSubject(input: RentInvoiceEmailInput): string {
  if (input.template?.email.subject && input.templateVars) {
    return interpolateTemplate(input.template.email.subject, input.templateVars);
  }
  return `【ご請求】${input.propertyName} ${formatJapaneseYearMonth(input.billingMonth)}分賃料`;
}

export function buildInvoiceEmailBody(input: RentInvoiceEmailInput): string {
  if (input.bodyTemplateText && input.templateVars) {
    return interpolateTemplate(input.bodyTemplateText, input.templateVars);
  }
  const due = formatJapaneseDate(paymentDueDate(input.billingMonth));
  const rent = new Intl.NumberFormat("ja-JP").format(input.monthlyRent);

  return `${input.tenantName} 様

いつもお世話になっております。
${input.companyName}でございます。

${formatJapaneseYearMonth(input.billingMonth)}分の賃料（${input.propertyName}）について、
請求書を添付いたしますのでご確認ください。

■ ご請求金額: ${rent}円（税込表示なし・非課税の可能性あり）
■ お支払期限: ${due}

お振込の際は、請求書記載の振込先をご利用ください。
ご不明点がございましたら、本メールへご返信ください。

※ 借主名・送付先メール・振込先口座は確定後に差し替えてください。

何卒よろしくお願い申し上げます。

────────────────
${input.companyName}
${input.senderEmail}
────────────────
`;
}

export function buildInvoiceEmailMarkdown(
  input: RentInvoiceEmailInput,
  pdfFilename: string
): string {
  const subject = buildInvoiceEmailSubject(input);
  const body = buildInvoiceEmailBody(input);

  return `# 請求メール文案 — ${input.billingMonth}

> **要記入:** 借主名・送付先メール・振込先口座を確定後、本文のプレースホルダを差し替えてください。

## 送信設定

| 項目 | 値 |
|------|-----|
| To | ${input.tenantEmail} |
| From | ${input.senderEmail} |
| 添付 | ${pdfFilename} |

## 件名

\`\`\`
${subject}
\`\`\`

## 本文

\`\`\`
${body.trimEnd()}
\`\`\`
`;
}

function foldBase64(base64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 76) {
    lines.push(base64.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

function encodeMimeHeaderUtf8(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

/** RFC 5322 MIME message — opens in Outlook, Apple Mail, etc. */
export function createInvoiceEml(
  input: RentInvoiceEmailInput,
  pdfPath: string,
  pdfFilename: string
): Buffer {
  const subject = buildInvoiceEmailSubject(input);
  const body = buildInvoiceEmailBody(input);
  const boundary = `----=_Steward_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const pdfBase64 = readFileSync(pdfPath).toString("base64");
  const bodyBase64 = Buffer.from(body, "utf-8").toString("base64");

  const parts = [
    `From: ${encodeMimeHeaderUtf8(input.companyName)} <${input.senderEmail}>`,
    `To: ${encodeMimeHeaderUtf8(input.tenantName)} <${resolveEmailAddress(input.tenantEmail)}>`,
    `Subject: ${encodeMimeHeaderUtf8(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    foldBase64(bodyBase64),
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdfFilename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${pdfFilename}"`,
    "",
    foldBase64(pdfBase64),
    "",
    `--${boundary}--`,
    "",
  ];

  return Buffer.from(parts.join("\r\n"), "utf-8");
}

function resolveEmailAddress(email: string): string {
  if (email.includes("@") && !email.includes("TBD")) return email;
  return "tenant-placeholder@example.com";
}

/**
 * Outlook .msg via @independentsoft/msg.
 * Note: npm package is evaluation/commercial license — prefer .eml for long-term archival.
 */
export function createInvoiceMsg(
  input: RentInvoiceEmailInput,
  pdfPath: string,
  pdfFilename: string
): Buffer {
  const subject = buildInvoiceEmailSubject(input);
  const body = buildInvoiceEmailBody(input);
  const pdfBuffer = readFileSync(pdfPath);

  const attachment = new msg.Attachment(pdfBuffer);
  attachment.fileName = pdfFilename;
  attachment.displayName = pdfFilename;

  const recipient = new msg.Recipient();
  recipient.addressType = "SMTP";
  recipient.displayType = msg.DisplayType.MAIL_USER;
  recipient.objectType = msg.ObjectType.MAIL_USER;
  recipient.displayName = input.tenantName;
  recipient.emailAddress = resolveEmailAddress(input.tenantEmail);
  recipient.recipientType = msg.RecipientType.TO;

  const message = new msg.Message();
  message.subject = subject;
  message.body = body;
  message.displayTo = input.tenantName;
  message.recipients.push(recipient);
  message.messageFlags.push(msg.MessageFlag.UNSENT);
  message.storeSupportMasks.push(msg.StoreSupportMask.CREATE);
  message.attachments.push(attachment);

  return message.toBytes();
}

export function writeInvoiceEmailArtifacts(
  input: RentInvoiceEmailInput,
  options: {
    pdfPath: string;
    pdfFilename: string;
    emailMdPath: string;
    emlPath: string;
    msgPath: string;
  }
): { md: string; eml: string; msg: string } {
  const md = buildInvoiceEmailMarkdown(input, options.pdfFilename);
  writeFileSync(options.emailMdPath, md, "utf-8");

  const eml = createInvoiceEml(input, options.pdfPath, options.pdfFilename);
  writeFileSync(options.emlPath, eml);

  const msgBytes = createInvoiceMsg(input, options.pdfPath, options.pdfFilename);
  writeFileSync(options.msgPath, msgBytes);

  return {
    md: options.emailMdPath,
    eml: options.emlPath,
    msg: options.msgPath,
  };
}
