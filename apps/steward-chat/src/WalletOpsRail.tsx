import { useMemo, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import type { OpsPrompt } from "./walletOps";

type MetaProps = {
  fiscalYear?: string;
  actualAsOf?: string | null;
  /** Last budget event id (BDE-######) — concurrency / sync token. */
  revision?: string;
  fetchedLabel: string;
  stale: "fresh" | "soft" | "hard";
  refreshing: boolean;
  onRefresh: () => void;
};

export function WalletOpsMeta({
  fiscalYear,
  actualAsOf,
  revision,
  fetchedLabel,
  stale,
  refreshing,
  onRefresh,
}: MetaProps) {
  const copy = useCopy(STEWARD_COPY);
  return (
    <div className="wallet-ops-meta" aria-live="polite">
      <div className="wallet-ops-meta__facts">
        {fiscalYear ? <span>{fiscalYear}</span> : null}
        {actualAsOf ? <span>{copy.actualThrough(actualAsOf)}</span> : <span>{copy.noActuals}</span>}
        {revision && revision !== "0" ? (
          <span title={copy.revisionTitle}>rev {revision}</span>
        ) : null}
        <span
          className={
            stale === "hard"
              ? "wallet-ops-meta__age is-hard"
              : stale === "soft"
                ? "wallet-ops-meta__age is-soft"
                : "wallet-ops-meta__age"
          }
        >
          {copy.fetched(fetchedLabel)}
          {refreshing ? copy.refreshing : ""}
        </span>
      </div>
      <button
        type="button"
        className="wallet-ghost-btn"
        disabled={refreshing}
        onClick={onRefresh}
      >
        {refreshing ? copy.refreshingShort : stale === "fresh" ? copy.refresh : copy.refetch}
      </button>
    </div>
  );
}

function dismissKey(scope: string, id: string): string {
  return `orgos.wallet.prompt.dismiss.${scope}.${id}`;
}

export function WalletOpsPrompts({
  prompts,
  scope = "default",
}: {
  prompts: OpsPrompt[];
  /** Session-dismiss scope (person+lane etc.). */
  scope?: string;
}) {
  const copy = useCopy(STEWARD_COPY);
  const [tick, setTick] = useState(0);
  const visible = useMemo(() => {
    void tick;
    return prompts.filter((prompt) => {
      try {
        return sessionStorage.getItem(dismissKey(scope, prompt.id)) !== "1";
      } catch {
        return true;
      }
    });
  }, [prompts, scope, tick]);

  if (visible.length === 0) return null;

  function dismiss(id: string) {
    try {
      sessionStorage.setItem(dismissKey(scope, id), "1");
    } catch {
      /* ignore quota / private mode */
    }
    setTick((n) => n + 1);
  }

  return (
    <section className="wallet-ops-prompts" aria-label={copy.checklist}>
      {visible.map((prompt) => (
        <article
          key={prompt.id}
          className={`wallet-ops-prompt is-${prompt.severity}`}
        >
          <header className="wallet-ops-prompt__head">
            <span className="wallet-ops-prompt__sev">
              {prompt.severity === "critical"
                ? copy.sevCritical
                : prompt.severity === "warn"
                  ? copy.sevWarn
                  : copy.sevInfo}
            </span>
            <strong>{prompt.title}</strong>
            <button
              type="button"
              className="wallet-ops-prompt__dismiss"
              onClick={() => dismiss(prompt.id)}
            >
              {copy.close}
            </button>
          </header>
          <p className="wallet-ops-prompt__q">{prompt.question}</p>
          {prompt.hints.length > 0 ? (
            <ul className="wallet-ops-prompt__hints">
              {prompt.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
    </section>
  );
}
