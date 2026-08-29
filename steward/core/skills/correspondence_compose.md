# Skill: correspondence_compose

**runtime:** cli  
**Path:** `steward/core/skills/correspondence_compose.md`

## 目的

受信メールと OrgOS 案件の **検証済み事実パック** から、LLM で社外返信下書きを生成する。**送信しない**（承認は人間）。

## 入力

| データ | パス / CLI |
|--------|------------|
| 受信 triage | `data/executive/mail-triage-queue.yaml` |
| 案件 | INQ / DEAL / SCH |
| 事実 | `orgos mail outbound facts verify` |
| 知識 | `orgos mail outbound knowledge search` |

## 出力

| 種別 | パス |
|------|------|
| 下書き | `docs/executive/correspondence-drafts/DRAFT-*.yaml` |
| 承認起案 | `data/org/pending-approvals.yaml` |

## CLI

```bash
orgos mail outbound facts verify --mail-id MSG-... --case INQ-...
orgos mail outbound compose --mail-id MSG-... --case INQ-...
orgos mail outbound correspondence style lint --id DRAFT-...
orgos org approval approve --id APR-... --reviewed
orgos mail outbound correspondence send --id DRAFT-...
```

## 禁止

- 金額・納期・在庫の創作
- 承認なし送信
- L2 本文の tracked MD 転記
