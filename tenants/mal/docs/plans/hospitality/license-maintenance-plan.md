# 許認可維持計画 — PROP-002

**CLI:** `orgos operations hospitality blockers` · `orgos operations permit registry list`

## 目標

- 旅館業許可（PER-RYOKAN-001）を active 維持
- 消防法令適合通知書 · 宿泊税登録を permit-registry へ（人間 TODO 追跡）

## 手順

1. `blockers` で G-01 / registration gap を確認
2. 変更届は `permit-app` 経由
3. 義務期限は `obligation-instances.yaml` と `ops-due` を突合
