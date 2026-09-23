# Skill: jp_breach_deadline_watch（漏えい等報告の期限監視）

**Module:** `jp_data_breach` · **Agent:** Privacy Officer · **Path:** `steward/jurisdiction-packs/JP/modules/jp_data_breach/agent.md`

## 手順

1. `operations data-breach deadlines [--as-of YYYY-MM-DD] [--json]` を日次実行
2. `overdue` · `due_soon` · `provisional`（needs_review 事案）を個人情報保護責任者へエスカレーション
3. 年初に `holidays.yaml` を内閣府の祝日 CSV から更新（未整備年は needs_review）

## 日数の数え方

- known_on（知った日）を1日目（通則編GL 3-5-3-4）
- 速報・委託元通知は GL 目安（概ね3〜5日）: 3日目で due_soon · 5日目を過ぎて未実施なら overdue
- 確報は 30 日（施行規則7条3号該当は 60 日）· 期限日が行政機関の休日なら翌開庁日

## 禁止

- 期限判定を法令適合の保証として扱うこと · 自動送信
