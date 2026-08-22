import { useCallback, useEffect, useState } from "react";
import { approveWithSettlementCeremony } from "@ops-shared/settlement-stepup-client";
import { useSettlementStepUp } from "@ops-shared/use-settlement-stepup";
import { webauthnUserMessage } from "@ops-shared/webauthn-user-error";
import {
  chatApi,
  fetchApprovals,
  fetchConfigApprovalPreview,
  rejectConfigChange,
  type TenantConfigPreview,
  type TodayApprovalItem,
} from "./api";

/**
 * CEO approval queue for tenant.config (and other pending items surfaced by Today).
 */
export function ApprovalsQueue() {
  const [items, setItems] = useState<TodayApprovalItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, TenantConfigPreview>>(
    {},
  );
  const { runCeremony, modal } = useSettlementStepUp(chatApi);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchApprovals();
      setItems(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const configItems = items.filter((a) => a.subject_type === "tenant.config");
  const configIds = configItems.map((i) => i.id).join(",");

  useEffect(() => {
    for (const item of configItems) {
      if (previews[item.id]) continue;
      void fetchConfigApprovalPreview(item.id)
        .then((preview) => {
          setPreviews((prev) => ({ ...prev, [item.id]: preview }));
        })
        .catch(() => {
          /* preview optional until approve */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when id set changes
  }, [configIds]);

  if (configItems.length === 0 && !error && !modal) return null;

  async function onApprove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await approveWithSettlementCeremony({
        api: chatApi,
        approvalId: id,
        tryApprove: () =>
          chatApi(`/chat/v1/approvals/${encodeURIComponent(id)}/approve`, {
            method: "POST",
            body: JSON.stringify({ flush: true, reviewed: true }),
          }),
        runCeremony,
      });
      await reload();
    } catch (err) {
      setError(webauthnUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await rejectConfigChange(id, "rejected from Steward Chat");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {modal}
      <section className="approvals-queue" aria-label="テナント設定の承認待ち">
        <header className="approvals-queue-header">
          <h2 className="approvals-queue-title">設定変更の承認</h2>
          <button
            type="button"
            className="agent-chat-text-btn"
            onClick={() => void reload()}
          >
            更新
          </button>
        </header>
        {error && <div className="error-banner">{error}</div>}
        <ul className="approvals-queue-list">
          {configItems.map((item) => {
            const preview = previews[item.id];
            return (
              <li key={item.id} className="approvals-queue-item">
                <p className="approvals-queue-message">
                  {item.message ?? item.subject}
                </p>
                {preview ? (
                  <>
                    <p className="approvals-queue-diff">
                      <code>{preview.diff_line}</code>
                    </p>
                    <ul className="approvals-queue-effects">
                      {preview.side_effects_plan.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="approvals-queue-muted">差分を読み込み中…</p>
                )}
                <div className="approvals-queue-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busyId === item.id}
                    onClick={() => void onApprove(item.id)}
                  >
                    {busyId === item.id ? "処理中…" : "承認して適用"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === item.id}
                    onClick={() => void onReject(item.id)}
                  >
                    却下
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
