import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";

/**
 * Guide: switch Operator Console from local Ollama to cloud LLM APIs.
 */
export function CloudLlmGuidePage() {
  const copy = useCopy(STEWARD_COPY);
  return (
    <div className="cloud-llm-page">
      <header className="cloud-llm-header">
        <h1 className="cloud-llm-title">{copy.cloudTitle}</h1>
        <p className="cloud-llm-lead">{copy.cloudLead}</p>
      </header>

      <section className="cloud-llm-section">
        <h2>{copy.cloudStep1}</h2>
        <ul>
          <li>
            <a href="https://ollama.com/settings/keys" target="_blank" rel="noopener noreferrer">
              Ollama Cloud
            </a>
          </li>
          <li>
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
              OpenAI（ChatGPT）
            </a>
          </li>
          <li>
            <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">
              Anthropic（Claude）
            </a>
          </li>
        </ul>
      </section>

      <section className="cloud-llm-section">
        <h2>{copy.cloudStep2}</h2>
        <p>{copy.cloudExampleOllama}</p>
        <pre className="cloud-llm-code">{`# OS_Community/.env
OLLAMA_API_KEY=`}</pre>
        <p>{copy.cloudExampleOpenai}</p>
        <pre className="cloud-llm-code">{`ORGOS_USE_OLLAMA=0
ORGOS_LLM_MOCK=0
ORGOS_LLM_PROVIDER=openai-compatible
ORGOS_LLM_API_URL=https://api.openai.com/v1
ORGOS_LLM_API_KEY=sk-...
ORGOS_LLM_MODEL=gpt-4o-mini`}</pre>
        <p>{copy.cloudExampleClaude}</p>
        <pre className="cloud-llm-code">{`ORGOS_USE_OLLAMA=0
ORGOS_LLM_MOCK=0
ORGOS_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ORGOS_LLM_MODEL=claude-sonnet-4-20250514`}</pre>
        <p>{copy.cloudRestart}</p>
      </section>

      <section className="cloud-llm-section">
        <h2>{copy.cloudNotes}</h2>
        <p>{copy.cloudNotesBody}</p>
      </section>

      <p className="cloud-llm-back">
        <a href="/llm-workers/">{copy.workersLink}</a>
        {" · "}
        <a href="/steward/">{copy.backSteward}</a>
        {" · "}
        <a href="/secretary/">{copy.backSecretary}</a>
      </p>
    </div>
  );
}
