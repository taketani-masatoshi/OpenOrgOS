# Skill: jp_foreign_worker_check（外国人労働者の就労可否チェック）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_visa_employment/skills/jp_foreign_worker_check.md`
**Runtime:** `cli` · **Module:** `jp_visa_employment` · **Agent:** Human Resources（proxy）

## CLI

registry は `argv` 方式（`skills run` は deferred · 下記 CLI を直接実行）。

```bash
npm run orgos -- --tenant demo operations foreign-workers check --as-of 2026-09-24
npm run orgos -- --tenant demo operations foreign-workers expiry --as-of 2026-09-24
```

## 手順

1. `operations foreign-workers validate` でデータ整合（在留資格コード · 業務区分 · 包括許可 28h 上限）を確認
2. `check` — 就労可否 · 資格外活動の週次時間 · 在留カード確認記録 · 特定技能/技能実習の要確認事項
3. `expiry` — 在留期間満了の段階（更新申請可能期間 · 30日以内 · 経過 · 特例期間の可能性）
4. `alert` / `needs_review` を人事担当が確認し、必要に応じ行政書士へ相談

## 禁止

- 在留カード番号 · 旅券番号 · 国籍 · 住所の記録・出力
- 「雇用可」「適法」の断定 · 行政への自動申請
