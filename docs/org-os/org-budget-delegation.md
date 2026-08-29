# Org Budget Delegation（執行枠の委譲）

**版:** 1.0 · **日付:** 2026-08-24  
**ADR:** [0027](../adr/0027-budget-envelope-governance.md)  
**状態:** 実装済み（本ドキュメントは実装に合わせた後追い正本）

## 目的

全社執行枠 → 部門枠 → 個人枠（必要なら費目別）を YAML 正本で管理し、Steward Chat から提案・承認・配賦する。

## データ正本

| パス | 内容 |
|------|------|
| `tenants/{id}/data/org/budget-delegation.yaml` | アクティブ FY の執行枠（またはミラーへのポインタ運用） |
| `tenants/{id}/data/org/budget-delegation-fy{YYYY}.yaml` | FY ミラー（実装がスキャン） |
| `tenants/{id}/data/org/org-authority.yaml` | 部門権限 + 計画/実績（万円）— 予算画面の補助正本 |
| `tenants/{id}/data/org/org-chart.yaml` | 実組織ノード（`person_id` 解決） |
| 事業計画 / outlook | 計画承認状態（増額ロックの入力） |

スキーマ: `schemas/org/budget-delegation.ts` · `schemas/org/org-authority.ts`

## 階層

```
company_budget_yen
  └─ departments[].allocation_yen
        └─ member_budgets[].allocation_yen
             └─ category_budgets[] (任意 · 4桁 account_code)
```

- 下位合計 ≤ 上位枠（スキーマ `superRefine` + lib 検証）。
- 費目は上位に存在する `account_code` のみ。

## ガバナンス（ADR 0027）

| ルール | 挙動 |
|--------|------|
| 事業計画未承認 | **増額のみ**ブロック。枠内再配分は可 |
| within_policy | 計画基準 ± `*_max_adjustment_pct` 内 → 通常上長承認 |
| beyond_policy | 帯外 → `board_event_id`（closed/archived · meeting\|governance）必須 |
| variance_alert_pct | 実績超過アラート（既定 20%） |

Pending 変更: `pending_changes[]`（`BDC-######`）+ org approval。

## HTTP（Steward Chat BFF）

プレフィックス: `/chat/v1/org/budget`（互換 `/api/v1/org/budget`）

主な面（実装: `src/lib/steward-chat/routes/org-budget-api.ts`）:

- 概要・配賦・個人配布の読取 / 更新（CAS revision）
- 経費精算: [expense-claim-spec.md](expense-claim-spec.md)

権限は operator RBAC（予算編集・承認は ceo/approver/部門長相当）。最終承認は [HumanApprovalContext](../adr/0038-human-approval-context.md) + 必要時 settlement PassKey。

## UI

| 画面 | パス / コンポーネント |
|------|----------------------|
| 予算パネル | `OrgBudgetPanel.tsx` |
| 配賦 | `OrgBudgetAllocation.tsx` |
| 個人配布・経費デスク | `OrgBudgetPeople.tsx` · `PersonalWallet.tsx` |
| 組織図（参照） | `OrgChartPage.tsx` · [org-chart.md](org-chart.md) |

## 実装パス

| 役割 | パス |
|------|------|
| Domain | `src/lib/org/budget-delegation.ts` |
| Authority | `src/lib/org/org-authority.ts` |
| HTTP | `src/lib/steward-chat/routes/org-budget-api.ts` |
| Schema | `schemas/org/budget-delegation.ts` |

## 関連

- [expense-claim-spec.md](expense-claim-spec.md)
- [receipt-qr-spec.md](receipt-qr-spec.md)
- [org-approval-schema.md](org-approval-schema.md)
