import { useCallback, useEffect, useState } from "react";
import {
  fetchConnectorHub,
  fetchDriveExports,
  postAsanaPush,
  postConnectorConnect,
  postConnectorDisconnect,
  postDriveExport,
  postHttpOutboundExport,
  postSlackMessage,
  putConnectorSecrets,
  putConnectorSettings,
  putHttpOutboundSecrets,
  putHttpOutboundSettings,
  type ConnectorCard,
  type ConnectorHubSnapshot,
  type ConnectorProvider,
  type DriveExportRecord,
} from "./api";
import { OpsPage } from "./OpsPage";

function statusLabel(card: ConnectorCard): string {
  if (card.connected && card.expired) return "接続済み（期限切れ）";
  if (card.connected) return "接続済み";
  if (card.fallback_configured) return "簡易接続（webhook / PAT）";
  return "未接続";
}

export function IntegrationsHubPage() {
  const [hub, setHub] = useState<ConnectorHubSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState<{ provider: ConnectorProvider; url: string } | null>(
    null,
  );

  const [slackChannel, setSlackChannel] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [slackText, setSlackText] = useState("");
  const [asanaProject, setAsanaProject] = useState("");
  const [asanaPat, setAsanaPat] = useState("");
  const [asanaTaskId, setAsanaTaskId] = useState("");
  const [driveFolder, setDriveFolder] = useState("");
  const [driveDocPath, setDriveDocPath] = useState("");
  const [driveExports, setDriveExports] = useState<DriveExportRecord[]>([]);
  const [httpBaseUrl, setHttpBaseUrl] = useState("");
  const [httpBearer, setHttpBearer] = useState("");
  const [httpExportId, setHttpExportId] = useState("");
  const [httpEnabled, setHttpEnabled] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchConnectorHub();
      setHub(next);
      const slack = next.connectors.find((c) => c.provider === "slack");
      const asana = next.connectors.find((c) => c.provider === "asana");
      const drive = next.connectors.find((c) => c.provider === "gdrive");
      setSlackChannel(slack?.settings.default_channel_id ?? "");
      setAsanaProject(asana?.settings.default_project_gid ?? "");
      setDriveFolder(drive?.settings.default_folder_id ?? "");
      setHttpBaseUrl(next.http_outbound?.base_url ?? "");
      setHttpEnabled(next.http_outbound?.enabled ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadExports = useCallback(async () => {
    const res = await fetchDriveExports().catch(() => null);
    if (res) setDriveExports(res.exports);
  }, []);

  useEffect(() => {
    void load();
    void loadExports();
  }, [load, loadExports]);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      setNote(await action());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function connect(provider: ConnectorProvider) {
    void run(async () => {
      const res = await postConnectorConnect(provider);
      setConnectUrl({ provider, url: res.connect_url });
      return "接続用リンクを発行しました。Community で許可してください。";
    });
  }

  function disconnect(provider: ConnectorProvider) {
    void run(async () => {
      await postConnectorDisconnect(provider);
      setConnectUrl(null);
      return "連携を解除しました。";
    });
  }

  const card = (provider: ConnectorProvider) =>
    hub?.connectors.find((c) => c.provider === provider);

  function renderCardHeader(provider: ConnectorProvider) {
    const c = card(provider);
    if (!c) return null;
    return (
      <>
        <h2 className="section-title">{c.label}</h2>
        <p className="ops-page-meta">
          {statusLabel(c)}
          {c.account_label ? ` · ${c.account_label}` : ""}
        </p>
        {!c.platform_ready && <p className="ops-page-meta">{c.platform_detail}</p>}
        <div className="section-actions">
          <button
            type="button"
            className="quiet-button"
            disabled={busy || !c.platform_ready}
            onClick={() => connect(provider)}
          >
            接続
          </button>
          {c.connected && (
            <button
              type="button"
              className="quiet-button"
              disabled={busy}
              onClick={() => disconnect(provider)}
            >
              解除
            </button>
          )}
        </div>
        {connectUrl?.provider === provider && (
          <p className="section-cta">
            <a className="btn btn-primary btn-sm" href={connectUrl.url}>
              Community で許可する
            </a>
          </p>
        )}
      </>
    );
  }

  return (
    <OpsPage
      title="連携設定"
      lead="Slack · Asana · Gmail · Google Drive · Direct HTTP。正本は OrgOS のまま、外部には写しだけを出します。"
      loading={!hub}
      loadingLabel="読み込み中"
      error={error}
      className="integrations-page"
    >
      {note && <p className="ops-page-meta">{note}</p>}

      <section className="ops-card">
        <h2 className="section-title">Direct HTTP / OData</h2>
        <p className="ops-page-meta">
          ERP 等への財務 L1 出力（Community OAuth なし）。口座番号は出しません。
        </p>
        <p className="ops-page-meta">
          {hub?.http_outbound
            ? `${hub.http_outbound.usable ? "利用可" : "未準備"} · ${hub.http_outbound.detail}`
            : "状態未取得"}
        </p>
        <label className="wallet-field">
          <span>
            <input
              type="checkbox"
              checked={httpEnabled}
              onChange={(e) => setHttpEnabled(e.target.checked)}
            />{" "}
            有効にする
          </span>
        </label>
        <label className="wallet-field">
          Base URL
          <input value={httpBaseUrl} onChange={(e) => setHttpBaseUrl(e.target.value)} />
        </label>
        <label className="wallet-field">
          Bearer トークン（保存後は非表示）
          <input
            type="password"
            autoComplete="off"
            value={httpBearer}
            onChange={(e) => setHttpBearer(e.target.value)}
          />
        </label>
        <p className="ops-page-meta">
          {hub?.http_outbound?.secrets.bearer_configured
            ? `Bearer 設定済み（${hub.http_outbound.secrets.bearer_hint}）`
            : "Bearer 未設定"}
        </p>
        <div className="section-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await putHttpOutboundSettings({
                  enabled: httpEnabled,
                  base_url: httpBaseUrl.trim() || undefined,
                  auth_kind:
                    httpBearer.trim() || hub?.http_outbound?.secrets.bearer_configured
                      ? "bearer"
                      : "none",
                  dialect: "rest",
                });
                if (httpBearer.trim()) {
                  await putHttpOutboundSecrets({
                    ORGOS_HTTP_OUTBOUND_BEARER: httpBearer.trim(),
                  });
                  setHttpBearer("");
                }
                return "HTTP outbound の設定を保存しました。";
              })
            }
          >
            保存
          </button>
        </div>
        <h3 className="section-title">財務を送る</h3>
        <label className="wallet-field">
          月（YYYY-MM）または請求 ID
          <input value={httpExportId} onChange={(e) => setHttpExportId(e.target.value)} />
        </label>
        <div className="section-actions">
          <button
            type="button"
            className="quiet-button"
            disabled={busy || !httpExportId.trim()}
            onClick={() =>
              void run(async () => {
                const kind = /^\d{4}-\d{2}$/.test(httpExportId.trim()) ? "monthly" : "invoice";
                const res = await postHttpOutboundExport({
                  kind,
                  id: httpExportId.trim(),
                  dry_run: true,
                });
                return res.ok
                  ? `確認: ${res.reason} → ${res.url ?? ""}`
                  : `確認失敗: ${res.reason}`;
              })
            }
          >
            送信前チェック
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy || !httpExportId.trim()}
            onClick={() =>
              void run(async () => {
                const kind = /^\d{4}-\d{2}$/.test(httpExportId.trim()) ? "monthly" : "invoice";
                const res = await postHttpOutboundExport({
                  kind,
                  id: httpExportId.trim(),
                  dry_run: false,
                });
                return res.ok
                  ? `送信しました（${res.export_id}）`
                  : `送信できません: ${res.reason}`;
              })
            }
          >
            送信
          </button>
        </div>
      </section>

      <section className="ops-card">
        {renderCardHeader("slack")}
        <label className="wallet-field">
          既定チャンネル ID
          <input value={slackChannel} onChange={(e) => setSlackChannel(e.target.value)} />
        </label>
        <label className="wallet-field">
          Incoming Webhook URL（簡易接続 · 保存後は非表示）
          <input
            type="password"
            autoComplete="off"
            value={slackWebhook}
            onChange={(e) => setSlackWebhook(e.target.value)}
          />
        </label>
        <p className="ops-page-meta">
          {hub?.secrets.slack_webhook_configured
            ? `webhook 設定済み（${hub.secrets.slack_webhook_hint}）`
            : "webhook 未設定"}
        </p>
        <div className="section-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (slackChannel.trim()) {
                  await putConnectorSettings("slack", { default_channel_id: slackChannel.trim() });
                }
                if (slackWebhook.trim()) {
                  await putConnectorSecrets({ ORGOS_SLACK_WEBHOOK_URL: slackWebhook.trim() });
                  setSlackWebhook("");
                }
                return "Slack の設定を保存しました。";
              })
            }
          >
            保存
          </button>
        </div>

        <h3 className="section-title">メッセージを送る</h3>
        <label className="wallet-field">
          本文（社外秘の本文・金額は書かない）
          <textarea
            rows={3}
            value={slackText}
            onChange={(e) => setSlackText(e.target.value)}
          />
        </label>
        <div className="section-actions">
          <button
            type="button"
            className="quiet-button"
            disabled={busy || !slackText.trim()}
            onClick={() =>
              void run(async () => {
                const res = await postSlackMessage({ text: slackText.trim(), dry_run: true });
                return `確認: ${res.reason}`;
              })
            }
          >
            送信前チェック
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy || !slackText.trim()}
            onClick={() =>
              void run(async () => {
                const res = await postSlackMessage({ text: slackText.trim() });
                if (res.sent) setSlackText("");
                return res.sent ? "Slack に送信しました。" : `送信できません: ${res.reason}`;
              })
            }
          >
            送信
          </button>
        </div>
      </section>

      <section className="ops-card">
        {renderCardHeader("asana")}
        <label className="wallet-field">
          既定プロジェクト GID
          <input value={asanaProject} onChange={(e) => setAsanaProject(e.target.value)} />
        </label>
        <label className="wallet-field">
          Personal Access Token（簡易接続 · 保存後は非表示）
          <input
            type="password"
            autoComplete="off"
            value={asanaPat}
            onChange={(e) => setAsanaPat(e.target.value)}
          />
        </label>
        <p className="ops-page-meta">
          {hub?.secrets.asana_pat_configured
            ? `PAT 設定済み（${hub.secrets.asana_pat_hint}）`
            : "PAT 未設定"}
        </p>
        <div className="section-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (asanaProject.trim()) {
                  await putConnectorSettings("asana", {
                    default_project_gid: asanaProject.trim(),
                  });
                }
                if (asanaPat.trim()) {
                  await putConnectorSecrets({ ORGOS_ASANA_PAT: asanaPat.trim() });
                  setAsanaPat("");
                }
                return "Asana の設定を保存しました。";
              })
            }
          >
            保存
          </button>
        </div>

        <h3 className="section-title">社長タスクを出す</h3>
        <p className="ops-page-meta">
          Work Order は実行状況の画面からも出せます。Asana 側の変更は OrgOS に戻しません。
        </p>
        <label className="wallet-field">
          タスク ID（例 TASK-001）
          <input value={asanaTaskId} onChange={(e) => setAsanaTaskId(e.target.value)} />
        </label>
        <div className="section-actions">
          <button
            type="button"
            className="quiet-button"
            disabled={busy || !asanaTaskId.trim()}
            onClick={() =>
              void run(async () => {
                const res = await postAsanaPush({
                  kind: "executive_task",
                  id: asanaTaskId.trim(),
                });
                return res.ok
                  ? `Asana に${res.created ? "作成" : "更新"}しました（${res.task_gid}）`
                  : `出せません: ${res.reason}`;
              })
            }
          >
            Asana に出す
          </button>
        </div>
      </section>

      <section className="ops-card">
        {renderCardHeader("gmail")}
        <p className="ops-page-meta">
          送信元や SMTP の設定は会社の設定にあります。送信は承認済みの下書きだけです。
        </p>
        <p className="section-cta">
          <a className="btn btn-primary btn-sm" href="/?onboarding=1">
            会社の設定を開く
          </a>
        </p>
      </section>

      <section className="ops-card">
        {renderCardHeader("gdrive")}
        <label className="wallet-field">
          保存先フォルダ ID
          <input value={driveFolder} onChange={(e) => setDriveFolder(e.target.value)} />
        </label>
        <div className="section-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy || !driveFolder.trim()}
            onClick={() =>
              void run(async () => {
                await putConnectorSettings("gdrive", { default_folder_id: driveFolder.trim() });
                return "保存先フォルダを保存しました。";
              })
            }
          >
            保存
          </button>
        </div>

        <h3 className="section-title">正本を PDF にして格納する</h3>
        <p className="ops-page-meta">
          出せるのは人が読む文書だけです（docs/company · docs/compliance · docs/reports の一部）。
        </p>
        <label className="wallet-field">
          文書パス（例 company/regulations/ringi-kessai-kisoku.md）
          <input value={driveDocPath} onChange={(e) => setDriveDocPath(e.target.value)} />
        </label>
        <div className="section-actions">
          <button
            type="button"
            className="quiet-button"
            disabled={busy || !driveDocPath.trim()}
            onClick={() =>
              void run(async () => {
                const res = await postDriveExport({ kind: "document", id: driveDocPath.trim() });
                await loadExports();
                return res.ok ? `Drive に格納しました（${res.file_name}）` : `格納できません: ${res.reason}`;
              })
            }
          >
            文書を格納
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const res = await postDriveExport({ kind: "executive_tasks" });
                await loadExports();
                return res.ok ? `Drive に格納しました（${res.file_name}）` : `格納できません: ${res.reason}`;
              })
            }
          >
            社長タスク一覧を格納
          </button>
        </div>

        {driveExports.length > 0 && (
          <>
            <h3 className="section-title">格納済み</h3>
            <ul className="ops-page-meta">
              {driveExports.slice(-10).map((e) => (
                <li key={`${e.kind}:${e.source_ref}`}>
                  {e.file_name} — {e.source_ref}（{e.exported_at.slice(0, 10)}）
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </OpsPage>
  );
}
