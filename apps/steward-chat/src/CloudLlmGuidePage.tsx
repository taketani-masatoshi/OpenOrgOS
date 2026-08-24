/**
 * Guide: switch Operator Console from local Ollama to cloud LLM APIs.
 */
export function CloudLlmGuidePage() {
  return (
    <div className="cloud-llm-page">
      <header className="cloud-llm-header">
        <h1 className="cloud-llm-title">クラウド LLM の接続</h1>
        <p className="cloud-llm-lead">
          ローカル LLM（Ollama）より速い応答が必要なとき、OpenAI や Anthropic（Claude）の API
          キーを Console に設定します。利用料は各社の課金です。
        </p>
      </header>

      <section className="cloud-llm-section">
        <h2>1. API キーを取得</h2>
        <ul>
          <li>
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
              OpenAI（ChatGPT 系）
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
        <h2>2. Console 起動時の環境変数</h2>
        <p>例（OpenAI）:</p>
        <pre className="cloud-llm-code">{`ORGOS_USE_OLLAMA=0
ORGOS_LLM_MOCK=0
ORGOS_LLM_PROVIDER=openai-compatible
ORGOS_LLM_API_URL=https://api.openai.com/v1
ORGOS_LLM_API_KEY=sk-...
ORGOS_LLM_MODEL=gpt-4o-mini`}</pre>
        <p>例（Claude）:</p>
        <pre className="cloud-llm-code">{`ORGOS_USE_OLLAMA=0
ORGOS_LLM_MOCK=0
ORGOS_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ORGOS_LLM_MODEL=claude-sonnet-4-20250514`}</pre>
        <p>設定後、Operator Console を再起動してください。</p>
      </section>

      <section className="cloud-llm-section">
        <h2>注意</h2>
        <p>
          クラウドに送る文脈はデータ分類（L0–L3）と Operator Policy に従ってください。給与・原価・個情などは載せないでください。
        </p>
      </section>

      <p className="cloud-llm-back">
        <a href="/llm-workers/">ワーカー設定</a>
        {" · "}
        <a href="/steward/">スチュワードに戻る</a>
        {" · "}
        <a href="/secretary/">秘書に戻る</a>
      </p>
    </div>
  );
}
