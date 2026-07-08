import type { MailThreadSummary } from "../api";

interface Props {
  threads: MailThreadSummary[];
  selectedThreadId?: string;
  onSelect: (threadId: string) => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ThreadList({ threads, selectedThreadId, onSelect }: Props) {
  if (!threads.length) {
    return <p className="mail-empty">スレッドがありません</p>;
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
              <span>{t.message_count} 件 · {formatWhen(t.last_at)}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
