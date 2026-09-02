import { useEffect, useMemo, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  fetchLlmWorkerModels,
  fetchLlmWorkers,
  type LlmWorkerRow,
} from "./api";
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
  /** Cursor-style chip inside the composer (no status line). */
  compact?: boolean;
  /** Web search always runs on a local worker. */
  forcedLocal?: boolean;
};

function sanitizeHint(
  hint: LlmRouteHint,
  workers: LlmWorkerRow[],
  modelsByWorker?: Record<string, string[]>,
): LlmRouteHint {
  if (!hint.worker_id) return hint.mode === "auto" ? { mode: "auto" } : { mode: hint.mode };
  const found = workers.find((w) => w.id === hint.worker_id && w.enabled);
  if (!found) return { mode: hint.mode === "auto" ? "auto" : hint.mode };
  const models = modelsByWorker?.[found.id];
  const model =
    found.tier === "local" && hint.model && (!models || models.includes(hint.model))
      ? hint.model
      : undefined;
  return { mode: found.tier, worker_id: found.id, ...(model ? { model } : {}) };
}

export function LlmRoutePicker({
  agentId,
  compact = false,
  forcedLocal = false,
}: Props) {
  const copy = useCopy(STEWARD_COPY);
  const [workers, setWorkers] = useState<LlmWorkerRow[]>([]);
  const [modelsByWorker, setModelsByWorker] = useState<Record<string, string[]>>({});
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [hint, setHint] = useState<LlmRouteHint>(() => loadLlmRoute(agentId));

  useEffect(() => {
    setHint(loadLlmRoute(agentId));
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    void fetchLlmWorkers({ probe: true })
      .then(async (data) => {
        if (cancelled) return;
        const enabled = data.workers.filter((w) => w.enabled);
        const discovered = Object.fromEntries(
          await Promise.all(
            enabled
              .filter((w) => w.tier === "local" && w.provider === "openai-compatible")
              .map(async (worker) => {
                try {
                  return [worker.id, await fetchLlmWorkerModels(worker.id)] as const;
                } catch {
                  return [worker.id, [worker.model]] as const;
                }
              }),
          ),
        );
        if (cancelled) return;
        setWorkers(enabled);
        setModelsByWorker(discovered);
        setLoadState("ok");
        setHint((current) => {
          const next = sanitizeHint(current, enabled, discovered);
          if (
            next.mode !== current.mode ||
            next.worker_id !== current.worker_id ||
            next.model !== current.model
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
  const effectiveHint: LlmRouteHint = forcedLocal
    ? hint.mode === "local"
      ? hint
      : { mode: "local" }
    : hint;

  function onChange(value: string) {
    const next = decodeLlmRouteSelect(value);
    setHint(next);
    saveLlmRoute(agentId, next);
  }

  const statusWorker =
    (effectiveHint.worker_id
      ? workers.find((w) => w.id === effectiveHint.worker_id)
      : undefined) ??
    (effectiveHint.mode === "cloud"
      ? cloudWorkers[0]
      : localWorkers[0] ?? workers[0]);
  const statusText =
    loadState === "loading"
      ? copy.llmRouteStatusLoading
      : loadState === "error"
        ? copy.llmRouteStatusUnavailable
        : !statusWorker
          ? hint.mode === "cloud"
            ? copy.llmRouteStatusNoCloud
            : copy.llmRouteStatusNoLocal
          : statusWorker.tier === "cloud" && !statusWorker.key_configured
            ? copy.llmRouteStatusKeyMissing(
                statusWorker.api_key_env || "OLLAMA_API_KEY",
              )
            : statusWorker.healthy
              ? copy.llmRouteStatusConnected(statusWorker.label || statusWorker.id)
              : copy.llmRouteStatusDisconnected(statusWorker.label || statusWorker.id);
  const statusOk =
    loadState === "ok" &&
    Boolean(statusWorker?.healthy) &&
    (statusWorker?.tier !== "cloud" || Boolean(statusWorker?.key_configured));

  const select = (
    <select
      className={
        compact ? "llm-route-picker-select" : "locale-picker-select"
      }
      value={encodeLlmRouteSelect(effectiveHint)}
      onChange={(e) => onChange(e.target.value)}
      aria-label={copy.llmRouteLabel}
      title={statusText}
    >
      {!forcedLocal && <option value="auto">{copy.llmRouteAuto}</option>}
      <option value="local">{copy.llmRouteLocalAny}</option>
      {localWorkers.length > 0 && (
        <optgroup label={copy.llmRouteGroupLocal}>
          {localWorkers.flatMap((w) => {
            const models = modelsByWorker[w.id] ?? [w.model];
            return models.map((model) => (
              <option
                key={`${w.id}:${model}`}
                value={encodeLlmRouteSelect({
                  mode: "local",
                  worker_id: w.id,
                  model,
                })}
              >
                {model}
              </option>
            ));
          })}
        </optgroup>
      )}
      {!forcedLocal && <option value="cloud">{copy.llmRouteCloudAny}</option>}
      {!forcedLocal && cloudWorkers.length > 0 && (
        <optgroup label={copy.llmRouteGroupCloud}>
          {cloudWorkers.map((w) => (
            <option key={w.id} value={`cloud:${w.id}`}>
              {w.label || w.id}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );

  if (compact) {
    return (
      <div
        className={
          statusOk
            ? "llm-route-picker is-compact is-ok"
            : "llm-route-picker is-compact is-warn"
        }
      >
        {select}
      </div>
    );
  }

  return (
    <label className="llm-route-picker">
      <span className="llm-route-picker-label">{copy.llmRouteLabel}</span>
      {select}
      <span
        className={
          statusOk
            ? "llm-route-picker-status is-ok"
            : "llm-route-picker-status is-warn"
        }
      >
        {statusText}
      </span>
    </label>
  );
}
