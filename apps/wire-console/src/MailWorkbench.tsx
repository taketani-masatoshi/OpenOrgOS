import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type DeliveryState,
  type HumanMessageBody,
  type HumanMessageSummary,
  type MailFolder,
  type MailThreadSummary,
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
import { ThreadList } from "./components/ThreadList";
import { WitnessPanel } from "./components/WitnessPanel";
import { useLiveRefresh } from "./useLiveRefresh";

interface Props {
  tenants: TenantSummary[];
}

export function MailWorkbench({ tenants }: Props) {
  const [activeId, setActiveId] = useState(tenants[0]?.id ?? "");
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>();
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>();
  const [snapshot, setSnapshot] = useState<TenantSnapshot | null>(null);
  const [messages, setMessages] = useState<HumanMessageSummary[]>([]);
  const [threads, setThreads] = useState<MailThreadSummary[]>([]);
  const [peers, setPeers] = useState<PeerProfile[]>([]);
  const [delivery, setDelivery] = useState<DeliveryState | null>(null);
  const [messageBody, setMessageBody] = useState<HumanMessageBody | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [scenario, setScenario] = useState<WireConsoleScenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTenant = useCallback(async (tenantId: string, keepSelection = false) => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    if (!keepSelection) {
      setSelectedMessageId(undefined);
      setSelectedThreadId(undefined);
      setMessageBody(null);
    }
    try {
      const base = `/console/v1/tenants/${tenantId}`;
      const [snap, msgRes, threadRes, peerRes, del, scenarioRes] = await Promise.all([
        api<TenantSnapshot & { ok: boolean }>(`${base}/snapshot`),
        api<{ ok: boolean; messages: HumanMessageSummary[] }>(`${base}/messages?folder=all`),
        api<{ ok: boolean; threads: MailThreadSummary[] }>(`${base}/threads?folder=all`),
        api<{ ok: boolean; peers: PeerProfile[] }>(`${base}/peers`),
        api<{ ok: boolean } & DeliveryState>(`${base}/delivery`),
        api<{ ok: boolean; scenario: WireConsoleScenario }>(`${base}/scenario`).catch(() => null),
      ]);
      setSnapshot(snap);
      setMessages(msgRes.messages);
      setThreads(threadRes.threads);
      setPeers(peerRes.peers);
      setDelivery({ pending: del.pending, delivered: del.delivered });
      setScenario(scenarioRes?.scenario ?? null);
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

  const selectMessage = useCallback(
    async (messageId: string) => {
      setSelectedMessageId(messageId);
      setBodyLoading(true);
      try {
        const body = await api<HumanMessageBody & { ok: boolean }>(
          `/console/v1/tenants/${activeId}/messages/${encodeURIComponent(messageId)}`
        );
        setMessageBody(body);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBodyLoading(false);
      }
    },
    [activeId]
  );

  const refreshTenant = useCallback(() => {
    void loadTenant(activeId, true);
    if (selectedMessageId) void selectMessage(selectedMessageId);
  }, [activeId, loadTenant, selectedMessageId, selectMessage]);

  useLiveRefresh(refreshTenant, Boolean(activeId));

  const counts = useMemo(
    () => ({
      inbox: messages.filter((m) => m.folder === "inbox").length,
      outbox: messages.filter((m) => m.folder === "outbox").length,
      pending: messages.filter((m) => m.folder === "pending" && m.status_label === "承認待ち").length,
      witness: messages.filter((m) => m.folder === "witness").length,
      threads: threads.length,
    }),
    [messages, threads]
  );

  useEffect(() => {
    if (scenario?.org_role === "witness") {
      setFolder("witness");
    }
  }, [activeId, scenario?.org_role]);

  const listMessages = useMemo(() => {
    if (folder === "threads") {
      if (!selectedThreadId) return [];
      return threads.find((t) => t.thread_id === selectedThreadId)?.messages ?? [];
    }
    if (folder === "inbox") return messages.filter((m) => m.folder === "inbox");
    if (folder === "outbox") return messages.filter((m) => m.folder === "outbox");
    if (folder === "pending") return messages.filter((m) => m.folder === "pending");
    if (folder === "witness") return messages.filter((m) => m.folder === "witness");
    return messages;
  }, [folder, messages, selectedThreadId, threads]);

  const selectedWireEventId =
    messageBody?.wire_event_id ??
    selectedMessageId ??
    scenario?.anchors.inter_org_event_id;

  if (!tenants.length) {
    return <p>Wire Console 用テナントが設定されていません。</p>;
  }

  return (
    <div className="mail-workbench">
      <nav className="tenant-tabs">
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
        <button type="button" className="tab refresh" onClick={() => refreshTenant()}>
          更新
        </button>
        {peers.length ? (
          <button type="button" className="tab compose-tab" onClick={() => setShowCompose(true)}>
            新規作成
          </button>
        ) : null}
      </nav>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="hint">読み込み中 {activeId}…</p> : null}

      {snapshot ? (
        <div className="snapshot-bar">
          <span className={snapshot.validation.ok ? "badge ok" : "badge warn"}>
            {snapshot.validation.ok ? "整合性 OK" : "要確認"}
          </span>
          <span className="badge">受信 {snapshot.counts.inbox}</span>
          <span className="badge">送信 {snapshot.counts.outbox}</span>
          <span className="badge">送信待ち {snapshot.counts.wire_pending}</span>
          <span className="badge">確認待ち {snapshot.counts.witness_pending}</span>
        </div>
      ) : null}

      {scenario ? <ScenarioGuide scenario={scenario} activeFolder={folder} /> : null}

      <div className="mail-layout">
        <MailFolderSidebar
          active={folder}
          counts={counts}
          showWitnessFolder={scenario?.org_role === "witness" || counts.witness > 0}
          onSelect={(f) => {
            setFolder(f);
            setSelectedThreadId(undefined);
            setSelectedMessageId(undefined);
            setMessageBody(null);
          }}
        />

        <div className="mail-list-pane">
          {folder === "threads" && !selectedThreadId ? (
            <ThreadList
              threads={threads}
              selectedThreadId={selectedThreadId}
              onSelect={(threadId) => {
                setSelectedThreadId(threadId);
                const first = threads.find((t) => t.thread_id === threadId)?.messages[0];
                if (first) void selectMessage(first.id);
              }}
            />
          ) : (
            <>
              {folder === "threads" && selectedThreadId ? (
                <button
                  type="button"
                  className="secondary thread-back"
                  onClick={() => {
                    setSelectedThreadId(undefined);
                    setSelectedMessageId(undefined);
                    setMessageBody(null);
                  }}
                >
                  ← スレッド一覧
                </button>
              ) : null}
              <MessageList
                messages={listMessages}
                selectedId={selectedMessageId}
                emptyMessage={
                  folder === "witness"
                    ? "確認待ちの項目はありません"
                    : folder === "pending"
                    ? "送信待ちの項目はありません"
                    : folder === "inbox"
                      ? "受信メッセージはありません"
                      : folder === "outbox"
                        ? "送信済みメッセージはありません"
                        : "メッセージがありません"
                }
                onSelect={(id) => void selectMessage(id)}
              />
            </>
          )}
        </div>

        <MessageReader
          tenantId={activeId}
          messageId={selectedMessageId}
          loading={bodyLoading}
          body={messageBody}
          onRefresh={refreshTenant}
        />
      </div>

      <details className="advanced-panel">
        <summary>配送・公証（オペレータ向け）</summary>
        <DeliveryPanel tenantId={activeId} delivery={delivery} onDone={() => refreshTenant()} />
        <WitnessPanel
          tenantId={activeId}
          selectedEventId={selectedWireEventId}
          onDone={() => refreshTenant()}
        />
      </details>

      <ComposeDialog
        tenantId={activeId}
        peers={peers}
        open={showCompose}
        onClose={() => setShowCompose(false)}
        onDone={() => refreshTenant()}
      />
    </div>
  );
}
