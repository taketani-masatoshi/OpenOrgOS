import { useEffect, useMemo, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { fetchLlmWorkers, type LlmWorkerRow } from "./api";
import { STEWARD_COPY } from "./steward-copy";
import {
  decodeLlmRouteSelect,
  encodeLlmRouteSelect,
  loadLlmRoute,
  saveLlmRoute,
  type LlmRouteHint,
} from "./llmRoute";

type Props = {
  agentId: string;
};

function sanitizeHint(hint: LlmRouteHint, workers: LlmWorkerRow[]): LlmRouteHint {
  if (!hint.worker_id) return hint.mode === "auto" ? { mode: "auto" } : { mode: hint.mode };
  const found = workers.find((w) => w.id === hint.worker_id && w.enabled);
  if (!found) return { mode: hint.mode === "auto" ? "auto" : hint.mode };
  return { mode: found.tier, worker_id: found.id };
}

export function LlmRoutePicker({ agentId }: Props) {
  const copy = useCopy(STEWARD_COPY);
  const [workers, setWorkers] = useState<LlmWorkerRow[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [hint, setHint] = useState<LlmRouteHint>(() => loadLlmRoute(agentId));

  useEffect(() => {
    setHint(loadLlmRoute(agentId));
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    void fetchLlmWorkers({ probe: true })
      .then((data) => {
        if (cancelled) return;
        const enabled = data.workers.filter((w) => w.enabled);
        setWorkers(enabled);
        setLoadState("ok");
        setHint((current) => {
          const next = sanitizeHint(current, enabled);
          if (
            next.mode !== current.mode ||
            next.worker_id !== current.worker_id
          ) {
            saveLlmRoute(agentId, next);
          }
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setWorkers([]);
          setLoadState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const localWorkers = useMemo(
    () => workers.filter((w) => w.tier === "local"),
    [workers],
  );
  const cloudWorkers = useMemo(
    () => workers.filter((w) => w.tier === "cloud"),
    [workers],
  );

  function onChange(value: string) {
    const next = decodeLlmRouteSelect(value);
    setHint(next);
    saveLlmRoute(agentId, next);
  }

  const statusWorker =
    (hint.worker_id
      ? workers.find((w) => w.id === hint.worker_id)
      : undefined) ??
    (hint.mode === "cloud"
      ? cloudWorkers[0]
      : localWorkers[0] ?? workers[0]);
  const statusText =
    loadState === "loading"
      ? copy.llmRouteStatusLoading
      : loadState === "error"
        ? copy.llmRouteStatusUnavailable
        : !statusWorker
          ? copy.llmRouteStatusNoLocal
          : statusWorker.healthy
            ? copy.llmRouteStatusConnected(statusWorker.label || statusWorker.id)
            : copy.llmRouteStatusDisconnected(statusWorker.label || statusWorker.id);

  return (
    <label className="llm-route-picker">
      <span className="llm-route-picker-label">{copy.llmRouteLabel}</span>
      <select
        className="locale-picker-select"
        value={encodeLlmRouteSelect(hint)}
        onChange={(e) => onChange(e.target.value)}
        aria-label={copy.llmRouteLabel}
      >
        <option value="auto">{copy.llmRouteAuto}</option>
        <option value="local">{copy.llmRouteLocalAny}</option>
        {localWorkers.length > 0 && (
          <optgroup label={copy.llmRouteGroupLocal}>
            {localWorkers.map((w) => (
              <option key={w.id} value={`local:${w.id}`}>
                {w.label || w.id}
              </option>
            ))}
          </optgroup>
        )}
        <option value="cloud">{copy.llmRouteCloudAny}</option>
        {cloudWorkers.length > 0 && (
          <optgroup label={copy.llmRouteGroupCloud}>
            {cloudWorkers.map((w) => (
              <option key={w.id} value={`cloud:${w.id}`}>
                {w.label || w.id}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <span
        className={
          loadState === "ok" && statusWorker?.healthy
            ? "llm-route-picker-status is-ok"
            : "llm-route-picker-status is-warn"
        }
      >
        {statusText}
      </span>
    </label>
  );
}
