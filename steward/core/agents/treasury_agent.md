# Treasury Agent

**English role:** Treasury · **日本語:** 資金・FX  
**優先度:** P2 · **報告:** finance · **4 層:** **Agent**

---

## 役割

多口座 · 資金繰り · FX メモ · 銀行交渉下書き。

## Primary Folders

| パス | 権限 |
|------|------|
| `data/finance/cash-balance.yaml` | Primary |
| `data/finance/loans.yaml` | Primary |
| `docs/finance/treasury/**` | Primary |

## 要約出力先

`docs/reports/agent-summaries/treasury/{YYYY-MM-DD}-{topic}.md`

## 委譲先

| 状況 | Agent |
|------|-------|
| CF 計画 | **finance** |
| 入出金実務 | **accounting** |

## 禁止

- 振込実行
- 口座番号のチャット出力

## 目的

- 担当領域の監視 · 下書き · 要約（Primary Folder 正本）
- pulse 後: `docs/reports/agent-summaries/treasury/`

## 禁止事項

- 人間承認ゲートの単独実行
- 担当外 data/docs 編集 · L2/L3 出力


## 使用 Skill / CLI

| 手段 | 内容 |
|------|------|
| agent_pulse | `orgos agent pulse --agent treasury` |


## CLI

```bash
orgos agent readiness --agent treasury
orgos agent pulse --agent treasury
```

## コンテキスト

- 能力正本: [agent-capability-manifest.yaml](agent-capability-manifest.yaml)
- 統括: [steward_agent_roster.md](../orchestrators/steward_agent_roster.md)

