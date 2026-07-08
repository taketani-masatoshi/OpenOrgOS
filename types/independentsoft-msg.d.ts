declare module "@independentsoft/msg" {
  export enum DisplayType {
    MAIL_USER = 0,
  }

  export enum ObjectType {
    MAIL_USER = 0,
  }

  export enum RecipientType {
    TO = 0,
  }

  export enum MessageFlag {
    UNSENT = 0,
  }

  export enum StoreSupportMask {
    CREATE = 0,
  }

  export class Attachment {
    constructor(data: Buffer);
    fileName: string;
    displayName: string;
  }

  export class Recipient {
    addressType: string;
    displayType: DisplayType;
    objectType: ObjectType;
    displayName: string;
    emailAddress: string;
    recipientType: RecipientType;
  }

  export class Message {
    subject: string;
    body: string;
    displayTo: string;
    recipients: Recipient[];
    messageFlags: MessageFlag[];
    storeSupportMasks: StoreSupportMask[];
    attachments: Attachment[];
    toBytes(): Buffer;
  }
}
