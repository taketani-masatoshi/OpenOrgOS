import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  fetchHubStatus,
  fetchPlatformIntegration,
  putPlatformIntegrationFlag,
  type HubStatusReport,
  type PlatformIntegrationSnapshot,
} from "./api";
import { OpsPage } from "./OpsPage";
import { STEWARD_COPY } from "./steward-copy";

/**
 * Platform operations view — Community shipping flags.
 * Not linked from tenant navigation; the BFF rejects non-platform operators.
 */
export function PlatformOpsPage() {
  const copy = useCopy(STEWARD_COPY);
  const [snapshot, setSnapshot] = useState<PlatformIntegrationSnapshot | null>(null);
  const [hub, setHub] = useState<HubStatusReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [integration, hubStatus] = await Promise.all([
        fetchPlatformIntegration(),
        fetchHubStatus().catch(() => null),
      ]);
      setSnapshot(integration);
      setHub(hubStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(flag: string, value: boolean) {
    setBusy(true);
    setError(null);
    try {
      await putPlatformIntegrationFlag(flag, value);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const env = snapshot?.community_env;

  return (
    <OpsPage title={copy.platformTitle} lead={copy.platformLead}>
      {error && <div className="error-banner">{error}</div>}

      {env && (
        <section className="ops-card">
          <h2 className="section-title">{copy.platformCommunityEnv}</h2>
          <p className="ops-page-meta">
            {env.shipped ? copy.platformEnvShipped : copy.platformEnvNotShipped}
            {` · ${env.url}`}
          </p>
          <p className="ops-page-meta">{env.detail}</p>
          {!env.shipped && <p className="ops-page-meta">{copy.platformEnvHowTo}</p>}
        </section>
      )}

      {hub && (
        <section className="ops-card">
          <h2 className="section-title">{copy.hubTitle}</h2>
          <p className="ops-page-meta">
            {copy.hubBind}: {hub.bind.host} ·{" "}
            {hub.bind.public_host ? copy.hubBindPublic : copy.hubBindLoopback} ·{" "}
            {hub.bind.allowed ? copy.hubBindAllowed : copy.hubBindBlocked}
          </p>
          {hub.bind.blocked_reason && (
            <p className="ops-page-meta">{hub.bind.blocked_reason}</p>
          )}
          <p className="ops-page-meta">
            TLS: {hub.tls.present ? copy.hubTlsPresent : copy.hubTlsMissing}
            {hub.tls.not_after ? ` · ${copy.hubTlsExpires} ${hub.tls.not_after.slice(0, 10)}` : ""}
            {hub.tls.expired ? ` · ${copy.hubTlsExpired}` : ""}
          </p>
          <p className="ops-page-meta">{copy.hubTlsPlacement}</p>
          <p className="ops-page-meta">
            /metrics: {hub.metrics.reachable ? copy.hubMetricsUp : copy.hubMetricsDown} ·{" "}
            {hub.metrics.detail}
          </p>
          <p className="ops-page-meta">
            {copy.hubReadyForRelay}:{" "}
            {hub.ga.ready_for_public_relay ? copy.hubYes : copy.hubNo}
          </p>
          <ul className="ops-list">
            {hub.ga.checks.map((check) => (
              <li key={check.id}>
                {check.pass ? "✓" : "·"} {check.id} — {check.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ops-card">
        <h2 className="section-title">{copy.platformFlags}</h2>
        {snapshot?.note && <p className="ops-page-meta">{snapshot.note}</p>}
        <ul className="ops-list">
          {Object.entries(snapshot?.flags ?? {}).map(([flag, value]) => (
            <li key={flag}>
              <label className="wallet-field">
                <input
                  type="checkbox"
                  checked={value}
                  disabled={busy}
                  onChange={(e) => void toggle(flag, e.target.checked)}
                />
                {flag}
              </label>
            </li>
          ))}
        </ul>
      </section>
    </OpsPage>
  );
}
