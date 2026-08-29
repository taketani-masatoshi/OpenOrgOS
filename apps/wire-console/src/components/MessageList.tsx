import { useUiLocale } from "@ops-shared/useUiLocale";
import { dateTimeLocale } from "@ops-shared/locale";
import type { HumanMessageSummary } from "../api";

interface Props {
  messages: HumanMessageSummary[];
  selectedId?: string;
  emptyTitle: string;
  emptyHint?: string;
  onSelect: (id: string) => void;
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

export function MessageList({
  messages,
  selectedId,
  emptyTitle,
  emptyHint,
  onSelect,
}: Props) {
  const locale = useUiLocale();
  if (!messages.length) {
    return (
      <div className="empty-state mail-empty">
        <strong>{emptyTitle}</strong>
        {emptyHint ? <p>{emptyHint}</p> : null}
      </div>
    );
  }

  return (
    <ul className="message-list">
      {messages.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            className={m.id === selectedId ? "message-row selected" : "message-row"}
            onClick={() => onSelect(m.id)}
            data-wire-event-id={m.wire_event_id ?? ""}
          >
            <div className="message-row-top">
              <strong className="message-subject">{m.subject}</strong>
              <span className={`status-pill tone-${m.status_tone}`}>{m.status_label}</span>
            </div>
            <div className="message-row-meta">
              <span>{m.counterparty}</span>
              <span>{formatWhen(m.recorded_at, locale)}</span>
            </div>
            <p className="message-preview">{m.preview}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
