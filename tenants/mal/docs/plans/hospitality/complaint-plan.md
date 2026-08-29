# クレーム対応計画 — PROP-002

**CLI:** `damage-log` · `damage-evidence` · `damage-claim` · `guest-message`

## 記録

1. `damage-log --description "..."`
2. 写真 path → `damage-evidence --path records/...`
3. 保険 → `damage-claim --status preparing|filed`

## ゲスト連絡

`guest-message render` で文面生成（送信は人間/OTA）
