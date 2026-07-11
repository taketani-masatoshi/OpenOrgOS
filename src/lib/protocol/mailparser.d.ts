declare module "mailparser" {
  export interface ParsedMailAddress {
    text: string;
  }

  export interface ParsedMailAttachment {
    contentType: string;
    filename?: string;
    content: Buffer;
  }

  export interface ParsedMail {
    headers: Map<string, unknown>;
    attachments: ParsedMailAttachment[];
    from?: ParsedMailAddress;
    subject?: string;
    text?: string;
    messageId?: string;
    date?: Date;
  }

  export function simpleParser(source: string | Buffer): Promise<ParsedMail>;
}
