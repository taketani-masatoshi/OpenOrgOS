# Skill: 民泊運用確認

**runtime:** cli

## 手順

1. `orgos operations permit list --property PROP-xxx` — `pt-minpaku-notification` の status
2. `orgos operations permit-app gate` — G-01 ブロッカー確認
3. `data/minpaku/operations-public.yaml` の届出番号を台帳と突合（L1 のみ）

届出未取得なら `permit-app create --type pt-minpaku-notification` から取得プロジェクトを開始する。
