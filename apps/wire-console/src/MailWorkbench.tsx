import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  classifyWaitFolder,
  type DeliveryState,
  type HumanMessageBody,
  type HumanMessageSummary,
  type MailFolder,
  type PeerProfile,
  type TenantSnapshot,
  type TenantSummary,
  type WireConsoleScenario,
} from "./api";
import { ComposeDialog } from "./components/ComposeDialog";
import { DeliveryPanel } from "./components/DeliveryPanel";
import { MailFolderSidebar } from "./components/MailFolderSidebar";
import { MessageList } from "./components/MessageList";
import { MessageReader } from "./components/MessageReader";
import { ScenarioGuide } from "./components/ScenarioGuide";
import { WitnessPanel } from "./components/WitnessPanel";
import { useCopy } from "@ops-shared/define-copy";
import { useLiveRefresh } from "./useLiveRefresh";
import { WIRE_COPY } from "./wire-copy";

interface Props {
  tenants: TenantSummary[];
}

function stableEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function MailWorkbench({ tenants }: Props) {
  const copy = useCopy(WIRE_COPY);
  const [activeId, setActiveId] = useState(tenants[0]?.id ?? "");
  const [folder, setFolder] = useState<MailFolder>("ours");
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>();
  const [snapshot, setSnapshot] = useState<TenantSnapshot | null>(null);
  const [messages, setMessages] = useState<HumanMessageSummary[]>([]);
  const [peers, setPeers] = useState<PeerProfile[]>([]);
  const [delivery, setDelivery] = useState<DeliveryState | null>(null);
  const [messageBody, setMessageBody] = useState<HumanMessageBody | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [scenario, setScenario] = useState<WireConsoleScenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTenant = useCallback(
    async (
      tenantId: string,
      opts: { keepSelection?: boolean; silent?: boolean } = {}
    ) => {
      if (!tenantId) return;
      const keepSelection = Boolean(opts.keepSelection);
      const silent = Boolean(opts.silent);
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      if (!keepSelection) {
        setSelectedMessageId(undefined);
        setMessageBody(null);
      }
      try {
        const base = `/console/v1/tenants/${tenantId}`;
        const [snap, msgRes, peerRes, del, scenarioRes] = await Promise.all([
          api<TenantSnapshot & { ok: boolean }>(`${base}/snapshot`),
          api<{ ok: boolean; messages: HumanMessageSummary[] }>(`${base}/messages?folder=all`),
          api<{ ok: boolean; peers: PeerProfile[] }>(`${base}/peers`),
          api<{ ok: boolean } & DeliveryState>(`${base}/delivery`),
          api<{ ok: boolean; scenario: WireConsoleScenario }>(`${base}/scenario`).catch(() => null),
        ]);
        setSnapshot((prev) => (stableEqual(prev, snap) ? prev : snap));
        setMessages((prev) => (stableEqual(prev, msgRes.messages) ? prev : msgRes.messages));
        setPeers((prev) => (stableEqual(prev, peerRes.peers ?? []) ? prev : (peerRes.peers ?? [])));
        setDelivery((prev) => {
          const next = { pending: del.pending, delivered: del.delivered };
          return stableEqual(prev, next) ? prev : next;
        });
        setScenario((prev) => {
          const next = scenarioRes?.scenario ?? null;
          return stableEqual(prev, next) ? prev : next;
        });
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (tenants.length && !activeId) setActiveId(tenants[0]!.id);
  }, [tenants, activeId]);

  useEffect(() => {
    void loadTenant(activeId);
  }, [activeId, loadTenant]);

  const selectMessage = useCallback(
    async (messageId: string, opts: { silent?: boolean } = {}) => {
      setSelectedMessageId(messageId);
      if (!opts.silent) setBodyLoading(true);
      try {
        const body = await api<HumanMessageBody & { ok: boolean }>(
          `/console/v1/tenants/${activeId}/messages/${encodeURIComponent(messageId)}`
        );
        setMessageBody((prev) => (stableEqual(prev, body) ? prev : body));
      } catch (e) {
        if (!opts.silent) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!opts.silent) setBodyLoading(false);
      }
    },
    [activeId]
  );

  const selectedMessageIdRef = useRef(selectedMessageId);
  selectedMessageIdRef.current = selectedMessageId;

  const refreshTenant = useCallback(
    (opts: { silent?: boolean } = {}) => {
      const silent = opts.silent ?? false;
      void loadTenant(activeId, { keepSelection: true, silent });
      const msgId = selectedMessageIdRef.current;
      if (msgId) void selectMessage(msgId, { silent: true });
    },
    [activeId, loadTenant, selectMessage]
  );

  useLiveRefresh(() => refreshTenant({ silent: true }), Boolean(activeId));

  const waitMessages = useMemo(
    () =>
      messages
        .map((m) => ({ m, wait: classifyWaitFolder(m) }))
        .filter((x): x is { m: HumanMessageSummary; wait: MailFolder } => x.wait != null),
    [messages]
  );

  const counts = useMemo(
    () => ({
      ours: waitMessages.filter((x) => x.wait === "ours").length,
      theirs: waitMessages.filter((x) => x.wait === "theirs").length,
    }),
    [waitMessages]
  );

  const listMessages = useMemo(
    () => waitMessages.filter((x) => x.wait === folder).map((x) => x.m),
    [waitMessages, folder]
  );

  const selectedWireEventId =
    messageBody?.wire_event_id ??
    messageBody?.event_id ??
    scenario?.anchors.inter_org_event_id;

  if (!tenants.length) {
    return (
      <div className="empty-state">
        <strong>{copy.noTenants}</strong>
        <p>{copy.noTenantsHint}</p>
      </div>
    );
  }

  return (
    <div className="mail-workbench">
      <div className="wire-secondary-bar">
        <nav className="tenant-tabs" aria-label={copy.tenants}>
          {tenants.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === activeId ? "tab active" : "tab"}
              onClick={() => setActiveId(t.id)}
              title={t.id}
            >
              {t.name ?? t.display_name ?? t.id}
            </button>
          ))}
        </nav>
        <div className="wire-secondary-actions">
          {snapshot ? (
            <div className="snapshot-bar">
              <span className={snapshot.validation.ok ? "badge ok" : "badge warn"}>
                {snapshot.validation.ok ? copy.integrityOk : copy.needsReview}
              </span>
              <span className="badge">{copy.waitingOursCount(counts.ours)}</span>
              <span className="badge">{copy.waitingTheirsCount(counts.theirs)}</span>
            </div>
          ) : null}
          <button type="button" className="quiet-button" onClick={() => refreshTenant({ silent: false })}>
            {copy.refresh}
          </button>
          {peers.length ? (
            <button type="button" className="btn btn-primary" onClick={() => setShowCompose(true)}>
              {copy.compose}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="hint">{copy.loading}</p> : null}

      {scenario ? <ScenarioGuide scenario={scenario} activeFolder={folder} /> : null}

      <div className="mail-layout">
        <MailFolderSidebar
          active={folder}
          counts={counts}
          onSelect={(f) => {
            setFolder(f);
            setSelectedMessageId(undefined);
            setMessageBody(null);
          }}
        />

        <div className="mail-list-pane">
          <MessageList
            messages={listMessages}
            selectedId={selectedMessageId}
            emptyTitle={
              folder === "ours" ? copy.emptyOurs : copy.emptyTheirs
            }
            emptyHint={
              folder === "ours" ? copy.emptyOursHint : copy.emptyTheirsHint
            }
            onSelect={(id) => void selectMessage(id)}
          />
        </div>

        <MessageReader
          tenantId={activeId}
          messageId={selectedMessageId}
          loading={bodyLoading}
          body={messageBody}
          onRefresh={() => refreshTenant({ silent: false })}
        />
      </div>

      <details className="advanced-panel">
        <summary>{copy.opsPanel}</summary>
        <DeliveryPanel
          tenantId={activeId}
          delivery={delivery}
          onDone={() => refreshTenant({ silent: true })}
        />
        <WitnessPanel
          tenantId={activeId}
          selectedEventId={selectedWireEventId}
          onDone={() => refreshTenant({ silent: true })}
        />
      </details>

      <ComposeDialog
        tenantId={activeId}
        peers={peers}
        open={showCompose}
        onClose={() => setShowCompose(false)}
        onDone={() => refreshTenant({ silent: true })}
      />
    </div>
  );
}
