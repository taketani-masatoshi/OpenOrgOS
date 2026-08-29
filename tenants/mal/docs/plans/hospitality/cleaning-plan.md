# 清掃計画 — PROP-002

**CLI:** `cleaning-order` · `cleaning-complete` · `cleaning-report` · `cleaning-accept` · `cleaning-issue`

## フロー

1. チェックアウト → `cleaning-order --stay-id ...`
2. ベンダー完了 → `cleaning-complete` / `cleaning-report`
3. 検収 → `cleaning-accept`（stay.cleaning_status = done）
4. 問題 → `cleaning-issue` + `cleaning-message`

## 契約

CTR-012 締結は人間 TODO（draft）
