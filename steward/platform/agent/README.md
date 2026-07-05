# Operator Agent Runtime · Portability

**正本:** [runtime.yaml](runtime.yaml) · **Export:** [exports/](exports/)

## 対応ツール

| ツール | 連携方法 |
|--------|----------|
| Cursor | `@steward/core/agents/*` · `.cursor/rules/operator-policy.mdc` · `@cursor/sdk` dispatch |
| Claude / ChatGPT | `orgos operator export --agent <id>` → pack を project instructions に |
| Claude Desktop / Continue | `orgos mcp start` + [exports/mcp/](exports/mcp/) snippet |
| Aider | `ORGOS_SHELL_PROFILE=aider` |
| Cline / OpenHands | `ORGOS_SHELL_PROFILE=cline` / `openhands`（prompt を cat 出力 · 要カスタム） |
| Steward Chat | OpenAI 互換 API · combined console |

## コマンド

```bash
orgos operator export --all
orgos operator export --agent finance
orgos operator portability --write
orgos operator sync-policy --emit all
orgos operator runtime show
ORGOS_SHELL_PROFILE=aider orgos operator runtime test
```

## Shell profiles

`runtime.yaml` の `profiles` — `{prompt}` `{workspace}` `{tenant}` を展開。

- **aider** — 本番推奨（ファイル入力）
- **cline** / **openhands** — プロンプト内容を stdout（手動連携の起点）

## MCP

```bash
orgos mcp rotate-token
orgos mcp start          # stdio — Cursor / Continue
orgos mcp serve-http     # HTTP — Open WebUI 等
```

Snippet: `exports/mcp/claude-desktop.snippet.json`
