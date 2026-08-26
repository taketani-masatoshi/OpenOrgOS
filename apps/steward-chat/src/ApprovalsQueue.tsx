import { useCallback, useEffect, useState } from "react";
import { approveWithSettlementCeremony } from "@ops-shared/settlement-stepup-client";
import { useSettlementStepUp } from "@ops-shared/use-settlement-stepup";
import { webauthnUserMessage } from "@ops-shared/webauthn-user-error";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import {
  chatApi,
  fetchApprovals,
  fetchAuthConfig,
  fetchConfigApprovalPreview,
  rejectConfigChange,
  type TenantConfigPreview,
  type TodayApprovalItem,
} from "./api";

function isTenantConfig(item: TodayApprovalItem): boolean {
  return item.subject_type === "tenant.config";
}

/**
 * CEO approval inbox — tenant.config and other pending items from Today.
 */
export function ApprovalsQueue({ asPage = false }: { asPage?: boolean }) {
  const copy = useCopy(STEWARD_COPY);
  const [items, setItems] = useState<TodayApprovalItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, TenantConfigPreview>>(
    {},
  );
  const [settlementCount, setSettlementCount] = useState<number | null>(null);
  const { runCeremony, modal } = useSettlementStepUp(chatApi);

  const reload = useCallback(async () => {
    try {
      const [rows, auth] = await Promise.all([fetchApprovals(), fetchAuthConfig()]);
      setItems(rows);
      setSettlementCount(auth.webauthn?.settlement_count ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const configItems = items.filter(isTenantConfig);
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

  if (!asPage && items.length === 0 && !error && !modal) return null;

  const settlementPasskeyMissing = settlementCount === 0;

  async function onApprove(id: string) {
    if (settlementPasskeyMissing) {
      setError(copy.settlementPasskeyRequired);
      return;
    }
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
      setError(webauthnUserMessage(err, { purpose: "settlement" }));
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await rejectConfigChange(id, "rejected from CEO inbox");
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
      <section
        className={asPage ? "approvals-inbox" : "approvals-queue"}
        aria-label={copy.approvalsLabel}
      >
        <header className={asPage ? "page-heading" : "approvals-queue-header"}>
          <div>
            <h1 className={asPage ? "ops-page-title" : "approvals-queue-title"}>
              {copy.approvalsTitle}
            </h1>
            {asPage ? <p className="ops-page-lead">{copy.approvalsLead}</p> : null}
          </div>
          <button
            type="button"
            className="quiet-button"
            onClick={() => void reload()}
          >
            {copy.refresh}
          </button>
        </header>
        {error && <div className="error-banner">{error}</div>}
        {settlementPasskeyMissing && items.length > 0 ? (
          <p className="approvals-queue-muted">
            {copy.settlementPasskeyRequired}{" "}
            <a href="/settings/">{copy.settlementPasskeySettingsLink}</a>
          </p>
        ) : null}
        {items.length === 0 && !error ? (
          <p className="approvals-queue-muted">{copy.approvalsEmpty}</p>
        ) : (
          <ul className="approvals-queue-list">
            {items.map((item) => {
              const preview = previews[item.id];
              const config = isTenantConfig(item);
              return (
                <li key={item.id} className="approvals-queue-item">
                  {item.subject_type ? (
                    <p className="approvals-queue-kind">{item.subject_type}</p>
                  ) : null}
                  <p className="approvals-queue-message">
                    {item.message ?? item.subject}
                  </p>
                  {config ? (
                    preview ? (
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
                      <p className="approvals-queue-muted">{copy.previewLoading}</p>
                    )
                  ) : null}
                  <div className="approvals-queue-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busyId === item.id || settlementPasskeyMissing}
                      onClick={() => void onApprove(item.id)}
                    >
                      {busyId === item.id ? copy.approving : copy.approveApply}
                    </button>
                    {config ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === item.id}
                        onClick={() => void onReject(item.id)}
                      >
                        {copy.reject}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
