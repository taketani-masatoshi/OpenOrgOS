/** Portable CLI labels for correspondence commands (mail_outbound 正本 · secretary はエイリアス). */
export const CORRESPONDENCE_CLI = {
  draft: "mail outbound correspondence draft",
  show: "mail outbound correspondence show",
  send: "mail outbound correspondence send",
  list: "mail outbound correspondence list",
  setupGuide: "mail outbound mail setup-guide",
  config: "mail outbound mail config",
  /** Legacy alias — still registered */
  legacyDraft: "secretary correspondence draft",
  legacySend: "secretary correspondence send",
  legacyShow: "secretary correspondence show",
} as const;

export const DEFAULT_CORRESPONDENCE_AGENT_ID = "mail_outbound";
