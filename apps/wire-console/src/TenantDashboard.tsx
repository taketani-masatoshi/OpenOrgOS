import { useCallback, useEffect, useState } from "react";
import {
  api,
  type DeliveryState,
  type EnvelopeListItem,
  type EventDetail,
  type PeerProfile,
  type TenantSnapshot,
  type TenantSummary,
  type TransactionRecord,
  type WireApproval,
} from "./api";
import { ApprovalsPanel } from "./components/ApprovalsPanel";
import { DeliveryPanel } from "./components/DeliveryPanel";
import { EnvelopeTable } from "./components/EnvelopeTable";
import { EventDetailPanel } from "./components/EventDetailPanel";
import { ProposeNoticeForm } from "./components/ProposeNoticeForm";
import { WitnessPanel } from "./components/WitnessPanel";
import { useCopy } from "@ops-shared/define-copy";
import { useLiveRefresh } from "./useLiveRefresh";
import { WIRE_COPY } from "./wire-copy";

interface Props {
  tenants: TenantSummary[];
}

export function TenantDashboard({ tenants }: Props) {
  const copy = useCopy(WIRE_COPY);
  const [activeId, setActiveId] = useState(tenants[0]?.id ?? "");
  const [snapshot, setSnapshot] = useState<TenantSnapshot | null>(null);
  const [outbox, setOutbox] = useState<EnvelopeListItem[]>([]);
  const [inbox, setInbox] = useState<EnvelopeListItem[]>([]);
  const [ledger, setLedger] = useState<TransactionRecord[]>([]);
  const [approvals, setApprovals] = useState<WireApproval[]>([]);
  const [peers, setPeers] = useState<PeerProfile[]>([]);
  const [delivery, setDelivery] = useState<DeliveryState | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>();
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTenant = useCallback(async (tenantId: string, keepSelection = false) => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    if (!keepSelection) {
      setSelectedEventId(undefined);
      setEventDetail(null);
    }
    try {
      const base = `/console/v1/tenants/${tenantId}`;
      const [snap, ob, ib, led, appr, peerRes, del] = await Promise.all([
        api<TenantSnapshot & { ok: boolean }>(`${base}/snapshot`),
        api<{ ok: boolean; entries: EnvelopeListItem[] }>(`${base}/outbox`),
        api<{ ok: boolean; entries: EnvelopeListItem[] }>(`${base}/inbox`),
        api<{ ok: boolean; transactions: TransactionRecord[] }>(`${base}/ledger`),
        api<{ ok: boolean; approvals: WireApproval[] }>(`${base}/approvals?scope=wire`),
        api<{ ok: boolean; peers: PeerProfile[] }>(`${base}/peers`),
        api<{ ok: boolean } & DeliveryState>(`${base}/delivery`),
      ]);
      setSnapshot(snap);
      setOutbox(ob.entries);
      setInbox(ib.entries);
      setLedger(led.transactions);
      setApprovals(appr.approvals);
      setPeers(peerRes.peers);
      setDelivery({ pending: del.pending, delivered: del.delivered });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tenants.length && !activeId) setActiveId(tenants[0]!.id);
  }, [tenants, activeId]);

  useEffect(() => {
    void loadTenant(activeId);
  }, [activeId, loadTenant]);

  const refreshTenant = useCallback(() => {
    void loadTenant(activeId, true);
  }, [activeId, loadTenant]);

  useLiveRefresh(refreshTenant, Boolean(activeId));

  async function selectEvent(eventId: string) {
    setSelectedEventId(eventId);
    setDetailLoading(true);
    try {
      const detail = await api<EventDetail & { ok: boolean }>(
        `/console/v1/tenants/${activeId}/events/${eventId}`
      );
      setEventDetail(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }

  function refreshTenantAndDetail() {
    refreshTenant();
    if (selectedEventId) void selectEvent(selectedEventId);
  }

  if (!tenants.length) {
    return <p>No wire_console tenants configured.</p>;
  }

  return (
    <div className="dashboard">
      <nav className="tenant-tabs">
        {tenants.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === activeId ? "tab active" : "tab"}
            onClick={() => setActiveId(t.id)}
          >
            {t.id}
          </button>
        ))}
        <button type="button" className="quiet-button" onClick={() => refreshTenantAndDetail()}>
          {copy.dashboardRefresh}
        </button>
      </nav>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="hint">{copy.loading}</p> : null}

      {snapshot ? (
        <div className="snapshot-bar">
          <span className={snapshot.validation.ok ? "badge ok" : "badge warn"}>
            {snapshot.validation.ok ? copy.validationOk : copy.needsReview}
          </span>
          <span className="badge">{copy.outbox(snapshot.counts.outbox)}</span>
          <span className="badge">{copy.inbox(snapshot.counts.inbox)}</span>
          <span className="badge">{copy.txns(snapshot.counts.transactions)}</span>
          <span className="badge">{copy.wirePending(snapshot.counts.wire_pending)}</span>
          <span className="badge">{copy.witnessPending(snapshot.counts.witness_pending)}</span>
          {snapshot.witness_pool?.enabled ? (
            <span className="badge">{copy.witnessHubs(snapshot.witness_pool.hub_count)}</span>
          ) : null}
          {snapshot.validation.warnings.slice(0, 2).map((w) => (
            <span key={w.code} className="badge warn" title={w.message}>
              {w.code}
            </span>
          ))}
        </div>
      ) : null}

      <div className="main-grid">
        <div className="main-col">
          {peers.length ? (
            <ProposeNoticeForm tenantId={activeId} peers={peers} onDone={() => refreshTenantAndDetail()} />
          ) : null}

          <ApprovalsPanel
            tenantId={activeId}
            approvals={approvals}
            onDone={() => refreshTenantAndDetail()}
          />

          <DeliveryPanel tenantId={activeId} delivery={delivery} onDone={() => refreshTenantAndDetail()} />

          <WitnessPanel
            tenantId={activeId}
            selectedEventId={selectedEventId}
            onDone={() => refreshTenantAndDetail()}
          />

          <EnvelopeTable
            title={copy.outboxTitle}
            entries={outbox}
            emptyMessage={copy.outboxEmpty}
            onSelect={(id) => void selectEvent(id)}
            selectedId={selectedEventId}
          />
          <EnvelopeTable
            title={copy.inboxTitle}
            entries={inbox}
            emptyMessage={copy.inboxEmpty}
            onSelect={(id) => void selectEvent(id)}
            selectedId={selectedEventId}
          />

          <section className="panel">
            <h3>
              Ledger <span className="count">{ledger.length}</span>
            </h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>id</th>
                    <th>type</th>
                    <th>dir</th>
                    <th>peer</th>
                    <th>contract</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((tx) => (
                    <tr key={tx.transaction_id} onClick={() => void selectEvent(tx.event_id)}>
                      <td>{tx.transaction_id}</td>
                      <td>{tx.transaction_type.replace("steward.", "")}</td>
                      <td>{tx.direction}</td>
                      <td>{tx.counterparty.org_id}</td>
                      <td>{tx.refs.contract_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3>
              Peers <span className="count">{peers.length}</span>
            </h3>
            <ul className="peer-list">
              {peers.map((p) => (
                <li key={p.peer_id}>
                  <strong>{p.peer_id}</strong> {p.display_name}
                  {p.org_uri ? ` · ${p.org_uri.replace("steward://tenant/", "")}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <EventDetailPanel
          tenantId={activeId}
          detail={eventDetail}
          loading={detailLoading}
          onClose={() => {
            setSelectedEventId(undefined);
            setEventDetail(null);
          }}
          onRefresh={() => refreshTenantAndDetail()}
        />
      </div>
    </div>
  );
}
