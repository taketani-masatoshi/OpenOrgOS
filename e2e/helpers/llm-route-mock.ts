import type { Page } from "@playwright/test";

const LOCAL_MODELS = ["qwen2.5:14b", "gemma4:12b", "gemma4:latest", "llama3.2:1b"];

/**
 * Stub LLM worker + model lists so chat chrome tests do not need a live Ollama.
 */
export async function mockLlmRouteCatalog(page: Page): Promise<void> {
  await page.route(/\/chat\/v1\/llm\/workers/, async (route) => {
    const url = route.request().url();
    if (url.includes("/models")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, models: LOCAL_MODELS }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        file_present: true,
        queue: {
          max_queue: 8,
          queue_timeout_ms: 60_000,
          cloud_overflow: {
            enabled: false,
            wait_threshold_ms: 1_000,
            max_inflight: 1,
          },
        },
        workers: [
          {
            id: "local-01",
            label: "Local",
            tier: "local",
            provider: "openai-compatible",
            base_url: "http://127.0.0.1:11434/v1",
            model: "qwen2.5:14b",
            max_inflight: 1,
            enabled: true,
            api_key_env: "",
            key_configured: true,
            healthy: true,
            inflight: 0,
            avg_latency_ms: 0,
            last_error: null,
            last_ok_at: null,
          },
          {
            id: "openai-01",
            label: "OpenAI",
            tier: "cloud",
            provider: "openai-compatible",
            base_url: "https://api.openai.com/v1",
            model: "gpt-4o-mini",
            max_inflight: 1,
            enabled: true,
            api_key_env: "OPENAI_API_KEY",
            key_configured: true,
            healthy: true,
            inflight: 0,
            avg_latency_ms: 0,
            last_error: null,
            last_ok_at: null,
          },
        ],
      }),
    });
  });
}

export { LOCAL_MODELS };
