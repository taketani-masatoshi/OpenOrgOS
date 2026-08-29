# メール文脈パイプライン（Mail Context Compose）

**版:** 1.0 · **日付:** 2026-08-28  
**ADR:** [0063](../adr/0063-mail-context-compose-pipeline.md)

## 役割分担

| 層 | 担当 |
|----|------|
| CLI | Gmail スレッド · 案件状態 · 知識検索 · 事実検証 |
| LLM | 検証済み事実からの文案のみ |
| OOO | style-lint · claims · 宛先 · 添付 · 人間承認 · 送信 |

案件正本は OrgOS（INQ / DEAL / SCH）。Asana は社外共有レプリカ。

## 手順（営業問合せ）

```bash
orgos mail intake sync
orgos mail intake thread show --id MSG-... --fetch
orgos sales inbound intake
orgos mail outbound facts verify --mail-id MSG-... --case INQ-...
orgos mail outbound compose --mail-id MSG-... --case INQ-...
orgos mail outbound correspondence style lint --id DRAFT-...
orgos org approval approve --id APR-... --approver "CEO" --reviewed
orgos mail outbound correspondence send --id DRAFT-...
# 任意
orgos integrations asana link --case INQ-... --task-gid <gid>
orgos integrations asana push --case INQ-...
```

## 禁止

- 未検証の金額・納期・在庫を本文に書く
- LLM / MCP からの直接送信
- Asana を案件正本にすること
- L2（メール本文・個人連絡先・口座）を Asana へ出すこと
- **未登録宛先への下書き作成**（`external-contacts` 必須）

## 送信・下書きゲート（強化）

| 時点 | 検査 |
|------|------|
| `correspondence draft` / `compose` | 宛先 registry · 添付 allowlist · claims（compose 時）· 在庫/納期語の禁止 |
| `correspondence send` | 上記 + style-lint |

在庫は `retail_store` 有効時のみ verified（照会語にマッチする SKU を優先）。納期は `next_action` が納期系かつ `next_action_due`、または見積 notes の ISO のみ verified。金額は draft 時点で常に verified amount claim 必須。style-lint は draft / compose / send で実行。
