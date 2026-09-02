export type LlmRouteHint = {
  mode: "auto" | "local" | "cloud";
  worker_id?: string;
  model?: string;
};

export function llmRouteStorageKey(agentId: string): string {
  return `orgos.llm.route.${agentId}`;
}

export function parseLlmRouteHint(raw: unknown): LlmRouteHint {
  if (!raw || typeof raw !== "object") return { mode: "auto" };
  const mode = (raw as { mode?: unknown }).mode;
  const workerId = (raw as { worker_id?: unknown }).worker_id;
  const model = (raw as { model?: unknown }).model;
  if (mode !== "auto" && mode !== "local" && mode !== "cloud") {
    return { mode: "auto" };
  }
  if (mode === "auto") return { mode: "auto" };
  if (typeof workerId === "string" && workerId.length > 0) {
    if (
      mode === "local" &&
      typeof model === "string" &&
      model.length > 0 &&
      model.length <= 200
    ) {
      return { mode, worker_id: workerId, model };
    }
    return { mode, worker_id: workerId };
  }
  return { mode };
}

export function loadLlmRoute(agentId: string): LlmRouteHint {
  try {
    const raw = localStorage.getItem(llmRouteStorageKey(agentId));
    if (!raw) return { mode: "auto" };
    return parseLlmRouteHint(JSON.parse(raw) as unknown);
  } catch {
    return { mode: "auto" };
  }
}

export function saveLlmRoute(agentId: string, hint: LlmRouteHint): void {
  const next =
    hint.mode === "auto" || !hint.worker_id
      ? { mode: hint.mode }
      : {
          mode: hint.mode,
          worker_id: hint.worker_id,
          ...(hint.mode === "local" && hint.model ? { model: hint.model } : {}),
        };
  localStorage.setItem(llmRouteStorageKey(agentId), JSON.stringify(next));
}

export function encodeLlmRouteSelect(hint: LlmRouteHint): string {
  if (hint.mode === "auto") return "auto";
  if (hint.worker_id && hint.model) {
    return `${hint.mode}:${hint.worker_id}|${encodeURIComponent(hint.model)}`;
  }
  if (hint.worker_id) return `${hint.mode}:${hint.worker_id}`;
  return hint.mode;
}

export function decodeLlmRouteSelect(value: string): LlmRouteHint {
  if (value === "auto" || value === "local" || value === "cloud") {
    return { mode: value };
  }
  const colon = value.indexOf(":");
  if (colon > 0) {
    const mode = value.slice(0, colon);
    const workerAndModel = value.slice(colon + 1);
    const separator = workerAndModel.indexOf("|");
    const workerId = separator >= 0 ? workerAndModel.slice(0, separator) : workerAndModel;
    const encodedModel = separator >= 0 ? workerAndModel.slice(separator + 1) : "";
    if ((mode === "local" || mode === "cloud") && workerId) {
      if (mode === "local" && encodedModel) {
        try {
          const model = decodeURIComponent(encodedModel);
          if (model && model.length <= 200) return { mode, worker_id: workerId, model };
        } catch {
          return { mode, worker_id: workerId };
        }
      }
      return { mode, worker_id: workerId };
    }
  }
  return { mode: "auto" };
}
