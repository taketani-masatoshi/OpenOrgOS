import { useCopy } from "@ops-shared/define-copy";
import type { EnvelopeListItem } from "../api";
import { shortDigest, shortId } from "../api";
import { WIRE_COPY } from "../wire-copy";

interface Props {
  title: string;
  entries: EnvelopeListItem[];
  emptyMessage: string;
  onSelect: (eventId: string) => void;
  selectedId?: string;
}

export function EnvelopeTable({ title, entries, emptyMessage, onSelect, selectedId }: Props) {
  const copy = useCopy(WIRE_COPY);
  return (
    <section className="panel">
      <h3>
        {title} <span className="count">{entries.length}</span>
      </h3>
      {entries.length === 0 ? (
        <div className="empty-state">
          <strong>{emptyMessage}</strong>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{copy.colNotice}</th>
                <th>{copy.colKind}</th>
                <th>{copy.colTxn}</th>
                <th>{copy.colDirection}</th>
                <th>{copy.colSummary}</th>
                <th>{copy.colOrigin}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.event_id}
                  className={selectedId === e.event_id ? "selected" : ""}
                  onClick={() => onSelect(e.event_id)}
                >
                  <td title={e.event_id}>{shortId(e.event_id)}</td>
                  <td>{e.event_type.replace("org.", "")}</td>
                  <td>{e.transaction_type?.replace("steward.", "") ?? "—"}</td>
                  <td>{e.direction ?? "—"}</td>
                  <td title={e.envelope_digest}>{shortDigest(e.envelope_digest)}</td>
                  <td>{e.has_provenance ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
