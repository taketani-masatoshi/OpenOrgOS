import { useCopy } from "@ops-shared/define-copy";
import { useUiLocale } from "@ops-shared/useUiLocale";
import { dateTimeLocale } from "@ops-shared/locale";
import type { MailThreadSummary } from "../api";
import { WIRE_COPY } from "../wire-copy";

interface Props {
  threads: MailThreadSummary[];
  selectedThreadId?: string;
  onSelect: (threadId: string) => void;
}

function formatWhen(iso: string, locale: "ja" | "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(dateTimeLocale(locale), {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ThreadList({ threads, selectedThreadId, onSelect }: Props) {
  const copy = useCopy(WIRE_COPY);
  const locale = useUiLocale();
  if (!threads.length) {
    return <p className="mail-empty">{copy.noThreads}</p>;
  }

  return (
    <ul className="thread-list">
      {threads.map((t) => (
        <li key={t.thread_id}>
          <button
            type="button"
            className={t.thread_id === selectedThreadId ? "thread-row selected" : "thread-row"}
            onClick={() => onSelect(t.thread_id)}
          >
            <div className="message-row-top">
              <strong>{t.title}</strong>
              <span className={`status-pill tone-${t.status_tone}`}>{t.status_label}</span>
            </div>
            <div className="message-row-meta">
              <span>{t.counterparty}</span>
              <span>{copy.messageCount(t.message_count)} · {formatWhen(t.last_at, locale)}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
