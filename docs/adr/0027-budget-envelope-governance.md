# ADR 0027 — Budget envelope governance (plan lock · policy band · board)

- **Status:** Accepted（実装先行 · 2026-08-24 文書復元）
- **Date:** 2026-07-20（実装開始時期の近似）· **Documented:** 2026-08-24
- **Context:** Steward Chat の予算委譲（全社 → 部門 → 個人）で、事業計画未承認のまま執行枠だけ増える・取締役会なしで大幅増額する、を防ぐ必要がある。

## Context

`data/org/budget-delegation.yaml`（FY ミラー含む）が執行枠の正本になった。一方で事業計画（business plan / outlook）は別 YAML で承認状態を持つ。コードは「計画未承認時は増額のみロック」「計画基準帯を超える変更は beyond_policy + board_event」を既に強制しているが、ADR ファイルが欠番のままだった。

## Decision

1. **事業計画ゲート（増額のみ）**  
   `business_plan_status` が `draft` / `pending_approval` / `missing` のとき、**執行枠（envelope）の増額を拒否**する。枠内の費目再配分・個人への割当は許可する。

2. **調整帯（within / beyond policy）**  
   計画基準額（baseline）に対し `adjustment_policy.company_max_adjustment_pct` / `department_max_adjustment_pct`（既定 20%）の帯内は `within_policy`（上長承認）。帯外は `beyond_policy` とし、**closed/archived の `meeting|governance` 会社イベント `board_event_id` 必須**。

3. **費目枠**  
   全社・部門・個人の費目合計は各々の総額枠を超えない。下位費目は上位に存在する account_code のみ。

4. **分散アラート**  
   `variance_alert_pct`（既定 20%）を超える実績超過はアラート対象（執行ブロックとは別）。

5. **自己承認禁止**  
   予算変更を含む内部承認は自己承認を禁止する（後続の全内部承認ポリシーと整合）。

6. **CAS**  
   HTTP / 同時編集はファイル revision（および claim 単位 revision）で楽観ロックする。

## Consequences

- UI（`OrgBudgetPanel` 等）と `org-budget-api` は上記ゲートをサーバ側で再検証する。
- 計画承認フロー（事業計画 UI / outlook）が未完了だと全社・部門の増額提案が失敗する。
- 詳細運用: [org-budget-delegation.md](../org-os/org-budget-delegation.md)

## Related

- `schemas/org/budget-delegation.ts`
- `src/lib/org/budget-delegation.ts`
- `src/lib/steward-chat/routes/org-budget-api.ts`
- [0036-tenant-config-approval.md](0036-tenant-config-approval.md)（別系統の承認）
- [0038-human-approval-context.md](0038-human-approval-context.md)
