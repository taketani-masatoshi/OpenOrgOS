# Skill: jp_ppc_breach_report（個情漏えい報告準備）

**Module:** `jp_data_breach` · **Agent:** Privacy Officer · **Path:** `steward/jurisdiction-packs/JP/modules/jp_data_breach/agent.md`

## 手順

1. `operations data-breach validate` で台帳を検証
2. `operations data-breach assess --incident <id>` で施行規則7条①〜④ · 暗号化除外 · needs_review を確認
3. 人間が報告要否と報告先（個人情報保護委員会／権限委任先省庁）を判断
4. `operations data-breach draft --incident <id> --kind preliminary|final [--write]`
5. 下書きを人間がレビューし、報告フォームへ人間が入力・提出。提出日を `incidents.yaml` に記録

## 禁止

- 報告不要の断定 · 自動送信 · 漏えいデータ実値や L2 の tracked 転記
