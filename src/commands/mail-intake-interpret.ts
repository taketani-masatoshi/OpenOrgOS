/** Mail intake — interpretation ensemble CLI. */
import { loadMailTriageQueue, findTriageEntry } from "../lib/correspondence/mail-triage-queue.js";
import { postTriageInterpretAndCeoAsk } from "../lib/correspondence/mail-triage-interpret.js";
import {
  interpretMailFromTriageEntry,
  findMailInterpretation,
} from "../lib/correspondence/mail-interpretation.js";

export async function runMailIntakeInterpret(opts: { id?: string; json?: boolean }): Promise<void> {
  if (opts.id) {
    const entry = findTriageEntry(opts.id);
    if (!entry) {
      console.error(`Triage entry not found: ${opts.id}`);
      process.exit(1);
    }
    const interpretation =
      findMailInterpretation(entry.id) ?? (await interpretMailFromTriageEntry(entry));
    await postTriageInterpretAndCeoAsk(entry);
    const payload = { mail_id: entry.id, interpretation };
    if (opts.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    if (!interpretation) {
      console.log(`（解釈なし — LLM 未設定または ensemble 無効）: ${entry.id}`);
      return;
    }
    console.log(
      `✓ ${entry.id}: ${interpretation.intent} · agreement ${Math.round(interpretation.agreement * 100)}%`
    );
    console.log(`  ${interpretation.summary_l1}`);
    return;
  }

  const queue = loadMailTriageQueue();
  let processed = 0;
  for (const entry of queue.entries) {
    if (entry.disposition === "spam" || entry.routing === "ignore") continue;
    if (!entry.sender_known) continue;
    if (!(
      entry.importance === "p0" ||
      entry.importance === "p1" ||
      entry.routing === "secretary"
    )) {
      continue;
    }
    await postTriageInterpretAndCeoAsk(entry);
    processed += 1;
  }
  const payload = { processed };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`Interpret processed: ${processed}`);
}
