import { normalizeEmailAddress } from "../correspondence/mail-address.js";
import { resolveEmailFromContactRef, verifyRecipientInRegistry } from "./contact-registry.js";

/** Resolve the draft recipient from `contact_ref` and warn when it is not in the registry. */
export function resolveContactRefForDraft(opts: { contactRef?: string; to?: string }): {
  to?: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  let to = opts.to;

  if (opts.contactRef) {
    const email = resolveEmailFromContactRef(opts.contactRef);
    if (email) {
      if (to && normalizeEmailAddress(to) !== normalizeEmailAddress(email)) {
        warnings.push(
          `--to (${to}) が --contact-ref ${opts.contactRef} の正本 (${email}) と一致しません`
        );
      } else if (!to) {
        to = email;
      }
    } else {
      warnings.push(`--contact-ref ${opts.contactRef} に email が未登録です`);
    }
  }

  if (to) {
    const verified = verifyRecipientInRegistry(to);
    if (!verified.verified) {
      warnings.push(
        `宛先 ${to} は正本未登録です。推測送信を避け、人間確認後に orgos secretary contacts register を実行してください`
      );
    }
  }

  return { to, warnings };
}
