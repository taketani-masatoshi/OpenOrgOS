import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import {
  fetchLlmWorkers,
  probeLlmWorker,
  updateLlmWorkers,
  type LlmWorkersSnapshot,
  type LlmWorkerRow,
} from "./api";

type WorkerPreset = {
  id: string;
  buttonLabel: string;
  row: Omit<
    LlmWorkerRow,
    "key_configured" | "healthy" | "inflight" | "avg_latency_ms" | "last_error" | "last_ok_at"
  >;
};

/** Representative endpoints — secret stays in env; only api_key_env name is stored. */
const WORKER_PRESETS: WorkerPreset[] = [
  {
    id: "openai",
    buttonLabel: "ChatGPT",
    row: {
      id: "openai-01",
      label: "ChatGPT",
      tier: "cloud",
      provider: "openai-compatible",
      base_url: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      max_inflight: 4,
      enabled: true,
      api_key_env: "OPENAI_API_KEY",
      supports_tools: true,
    },
  },
  {
    id: "claude",
    buttonLabel: "Claude",
    row: {
      id: "claude-01",
      label: "Claude",
      tier: "cloud",
      provider: "anthropic",
      base_url: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514",
      max_inflight: 4,
      enabled: true,
      api_key_env: "ANTHROPIC_API_KEY",
      supports_tools: true,
    },
  },
  {
    id: "ollama",
    buttonLabel: "Ollama",
    row: {
      id: "ollama-01",
      label: "Ollama",
      tier: "local",
      provider: "openai-compatible",
      base_url: "http://127.0.0.1:11434/v1",
      model: "gemma4:latest",
      max_inflight: 2,
      enabled: true,
      api_key_env: "ORGOS_LLM_API_KEY",
      supports_tools: false,
    },
  },
  {
    id: "lmstudio",
    buttonLabel: "LM Studio",
    row: {
      id: "lmstudio-01",
      label: "LM Studio",
      tier: "local",
      provider: "openai-compatible",
      base_url: "http://127.0.0.1:1234/v1",
      model: "local-model",
      max_inflight: 1,
      enabled: true,
      api_key_env: "ORGOS_LLM_API_KEY",
      supports_tools: false,
    },
  },
];

function runtimeFields(): Pick<
  LlmWorkerRow,
  "key_configured" | "healthy" | "inflight" | "avg_latency_ms" | "last_error" | "last_ok_at"
> {
  return {
    key_configured: false,
    healthy: true,
    inflight: 0,
    avg_latency_ms: 0,
    last_error: null,
    last_ok_at: null,
  };
}

function emptyWorker(label: string): LlmWorkerRow {
  return {
    id: `worker-${Date.now().toString(36)}`,
    label,
    tier: "local",
    provider: "openai-compatible",
    base_url: "http://127.0.0.1:11434/v1",
    model: "gemma3:12b",
    max_inflight: 1,
    enabled: true,
    api_key_env: "",
    supports_tools: false,
    ...runtimeFields(),
  };
}

function uniqueWorkerId(baseId: string, existing: LlmWorkerRow[]): string {
  if (!existing.some((w) => w.id === baseId)) return baseId;
  const stem = baseId.replace(/-\d+$/, "");
  let n = 2;
  while (existing.some((w) => w.id === `${stem}-${String(n).padStart(2, "0")}`)) {
    n += 1;
  }
  return `${stem}-${String(n).padStart(2, "0")}`;
}

function fromPreset(preset: WorkerPreset, existing: LlmWorkerRow[]): LlmWorkerRow {
  return {
    ...preset.row,
    id: uniqueWorkerId(preset.row.id, existing),
    ...runtimeFields(),
  };
}

/**
 * Configure LLM worker pool (Ollama / LM Studio / OpenAI / Claude).
 * API keys stay in env — this page only stores env var names.
 */
export function LlmWorkersPage() {
  const copy = useCopy(STEWARD_COPY);
  const [snapshot, setSnapshot] = useState<LlmWorkersSnapshot | null>(null);
  const [workers, setWorkers] = useState<LlmWorkerRow[]>([]);
  const [maxQueue, setMaxQueue] = useState(64);
  const [overflowEnabled, setOverflowEnabled] = useState(false);
  const [waitThreshold, setWaitThreshold] = useState(8000);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [probing, setProbing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const data = await fetchLlmWorkers();
    setSnapshot(data);
    setWorkers(data.workers);
    setMaxQueue(data.queue.max_queue);
    setOverflowEnabled(data.queue.cloud_overflow.enabled);
    setWaitThreshold(data.queue.cloud_overflow.wait_threshold_ms);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  function patchWorker(id: string, partial: Partial<LlmWorkerRow>) {
    setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, ...partial } : w)));
  }

  function removeWorker(id: string) {
    setWorkers((prev) => prev.filter((w) => w.id !== id));
  }

  function addPreset(preset: WorkerPreset) {
    setWorkers((prev) => [...prev, fromPreset(preset, prev)]);
    setSavedNote(null);
    setError(null);
  }

  function presetAlreadyAdded(preset: WorkerPreset): boolean {
    return workers.some(
      (w) =>
        w.provider === preset.row.provider &&
        w.base_url.replace(/\/$/, "") === preset.row.base_url.replace(/\/$/, "") &&
        w.tier === preset.row.tier,
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSavedNote(null);
    try {
      const data = await updateLlmWorkers({
        schema: "orgos.llm.workers.v1",
        queue: {
          max_queue: maxQueue,
          queue_timeout_ms: snapshot?.queue.queue_timeout_ms ?? 120_000,
          cloud_overflow: {
            enabled: overflowEnabled,
            wait_threshold_ms: waitThreshold,
            max_inflight: snapshot?.queue.cloud_overflow.max_inflight ?? 2,
          },
        },
        workers: workers.map((w) => ({
          id: w.id.trim(),
          label: w.label.trim(),
          tier: w.tier,
          provider: w.provider,
          base_url: w.base_url.trim(),
          model: w.model.trim(),
          max_inflight: w.max_inflight,
          enabled: w.enabled,
          api_key_env: w.api_key_env.trim(),
          supports_tools: Boolean(w.supports_tools),
        })),
      });
      setSnapshot(data);
      setWorkers(data.workers);
      setSavedNote(copy.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onProbe(id: string) {
    setProbing(id);
    setError(null);
    try {
      const result = await probeLlmWorker(id);
      if (!result.probe.ok) {
        setError(`${id}: ${result.probe.detail}`);
      } else {
        setSavedNote(`${id}: OK (${result.probe.latency_ms}ms)`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProbing(null);
    }
  }

  const inflight = snapshot?.queue.inflight ?? 0;
  const queued = snapshot?.queue.queued ?? 0;

  return (
    <div className="chat-settings-page llm-workers-page">
      <header className="chat-settings-header">
        <h1 className="chat-settings-title">{copy.workersTitle}</h1>
        <p className="chat-settings-lead">{copy.workersLead}</p>
      </header>

      {loading ? (
        <p className="chat-settings-muted">{copy.loading}</p>
      ) : (
        <form className="chat-settings-form" onSubmit={(e) => void onSubmit(e)}>
          <p className="llm-workers-status" aria-live="polite">
            {copy.workersRunning(inflight, queued)}
          </p>

          <fieldset className="chat-settings-fieldset">
            <legend>{copy.workersQueue}</legend>
            <div className="llm-workers-queue-row">
              <label className="llm-workers-field">
                <span>{copy.workersQueueLimit}</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={maxQueue}
                  disabled={busy}
                  onChange={(e) => setMaxQueue(Number(e.target.value) || 1)}
                />
              </label>
              <label className="chat-settings-option">
                <input
                  type="checkbox"
                  checked={overflowEnabled}
                  disabled={busy}
                  onChange={(e) => setOverflowEnabled(e.target.checked)}
                />
                <span>{copy.workersCloudOverflow}</span>
              </label>
              {overflowEnabled && (
                <label className="llm-workers-field">
                  <span>{copy.workersWaitThreshold}</span>
                  <input
                    type="number"
                    min={0}
                    max={600000}
                    value={waitThreshold}
                    disabled={busy}
                    onChange={(e) => setWaitThreshold(Number(e.target.value) || 0)}
                  />
                </label>
              )}
            </div>
          </fieldset>

          <fieldset className="chat-settings-fieldset">
            <legend>{copy.workersTable}</legend>
            <div className="llm-workers-table-wrap">
              <table className="llm-workers-table">
                <thead>
                  <tr>
                    <th>{copy.workersColStatus}</th>
                    <th>{copy.workersColName}</th>
                    <th>{copy.workersColKind}</th>
                    <th>URL</th>
                    <th>{copy.workersColModel}</th>
                    <th>{copy.workersColConcurrent}</th>
                    <th>{copy.workersColKeyEnv}</th>
                    <th>tools</th>
                    <th>{copy.workersColEnabled}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <span
                          className={
                            w.enabled && w.healthy
                              ? "llm-workers-dot is-ok"
                              : "llm-workers-dot is-bad"
                          }
                          title={w.last_error ?? (w.healthy ? "healthy" : "unhealthy")}
                        />
                      </td>
                      <td>
                        <input
                          value={w.label}
                          disabled={busy}
                          onChange={(e) => patchWorker(w.id, { label: e.target.value })}
                        />
                        <input
                          className="llm-workers-id"
                          value={w.id}
                          disabled={busy}
                          onChange={(e) => patchWorker(w.id, { id: e.target.value })}
                          aria-label="id"
                        />
                      </td>
                      <td>
                        <select
                          value={w.tier}
                          disabled={busy}
                          onChange={(e) =>
                            patchWorker(w.id, {
                              tier: e.target.value as LlmWorkerRow["tier"],
                            })
                          }
                        >
                          <option value="local">local</option>
                          <option value="cloud">cloud</option>
                        </select>
                        <select
                          value={w.provider}
                          disabled={busy}
                          onChange={(e) =>
                            patchWorker(w.id, {
                              provider: e.target.value as LlmWorkerRow["provider"],
                            })
                          }
                        >
                          <option value="openai-compatible">{copy.openaiCompat}</option>
                          <option value="anthropic">Anthropic</option>
                        </select>
                      </td>
                      <td>
                        <input
                          value={w.base_url}
                          disabled={busy}
                          onChange={(e) => patchWorker(w.id, { base_url: e.target.value })}
                        />
                        {w.resolved_base_url &&
                          w.resolved_base_url !== w.base_url.replace(/\/$/, "") && (
                            <p className="llm-workers-key-hint is-ok">
                              {w.resolved_base_url}
                            </p>
                          )}
                      </td>
                      <td>
                        <input
                          value={w.model}
                          disabled={busy}
                          onChange={(e) => patchWorker(w.id, { model: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          max={32}
                          value={w.max_inflight}
                          disabled={busy}
                          onChange={(e) =>
                            patchWorker(w.id, {
                              max_inflight: Number(e.target.value) || 1,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={w.api_key_env}
                          placeholder={
                            w.provider === "anthropic"
                              ? "ANTHROPIC_API_KEY"
                              : w.tier === "cloud"
                                ? "OPENAI_API_KEY"
                                : "ORGOS_LLM_API_KEY"
                          }
                          disabled={busy}
                          onChange={(e) =>
                            patchWorker(w.id, { api_key_env: e.target.value })
                          }
                        />
                        <span
                          className={
                            w.key_configured
                              ? "llm-workers-key-hint is-ok"
                              : "llm-workers-key-hint"
                          }
                        >
                          {w.tier === "local" && w.provider === "openai-compatible"
                            ? copy.localKeyOptional
                            : w.key_configured
                              ? copy.envReady
                              : copy.keyInEnv}
                        </span>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(w.supports_tools)}
                          disabled={busy}
                          title="OpenAI tool calling"
                          onChange={(e) =>
                            patchWorker(w.id, { supports_tools: e.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={w.enabled}
                          disabled={busy}
                          onChange={(e) =>
                            patchWorker(w.id, { enabled: e.target.checked })
                          }
                        />
                      </td>
                      <td className="llm-workers-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy || probing === w.id}
                          onClick={() => void onProbe(w.id)}
                        >
                          {copy.workersProbe}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => removeWorker(w.id)}
                        >
                          {copy.workersDelete}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="llm-workers-presets" role="group" aria-label={copy.presets}>
              {WORKER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  title={
                    presetAlreadyAdded(preset)
                      ? copy.presetExists
                      : `${preset.row.base_url} · ${preset.row.model}`
                  }
                  onClick={() => addPreset(preset)}
                >
                  + {preset.buttonLabel}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => setWorkers((prev) => [...prev, emptyWorker(copy.workersNewLabel)])}
              >
                {copy.workersManual}
              </button>
            </div>
          </fieldset>

          {error && (
            <p className="chat-settings-error" role="alert">
              {error}
            </p>
          )}
          {savedNote && (
            <p className="chat-settings-ok" role="status">
              {savedNote}
            </p>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {copy.save}
          </button>
        </form>
      )}

      <p className="chat-settings-back">
        <a href="/steward/">{copy.backSteward}</a>
        {" · "}
        <a href="/secretary/">{copy.backSecretary}</a>
        {" · "}
        <a href="/cloud-llm/">{copy.cloudLink}</a>
      </p>
    </div>
  );
}
