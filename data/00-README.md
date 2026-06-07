# data/ — 正データカタログ

**Source of Truth:** このディレクトリの YAML のみ。人向け表は `docs/exports/*.csv`（`steward sync all` で生成）。

---

## ファイル一覧

| パス | スキーマ | 説明 |
|------|---------|------|
| `company.yaml` | company | 法人基本情報 |
| `properties/PROP-*.yaml` | property | 物件台帳 |
| `contracts/CTR-*.yaml` | contract | 契約台帳 |
| `finance/monthly/{YYYY-MM}.yaml` | monthlyFinance | 月次収支 |
| `finance/fixed-costs.yaml` | fixedCosts | 本社固定費 |
| `finance/payroll.yaml` | payroll | 役員報酬 |
| `finance/loans.yaml` | loans | 借入・役員貸付 |
| `finance/cash-balance.yaml` | cashBalance | 現預金残高（ランウェイ） |
| `finance/fixed-assets.yaml` | fixedAssets | 固定資産台帳 |
| `finance/tax-profile.yaml` | taxProfile | 税務プロファイル |
| `finance/chart-of-accounts.yaml` | chartOfAccounts | 勘定科目 |
| `plans/business-plan.yaml` | businessPlan | 中期計画 |
| `plans/yojitsu-{year\|fy}.yaml` | yojitsuPlan | 予実（カレンダー/FY） |
| `plans/revenue-plan.yaml` | revenuePlan | 売上計画 |
| `plans/expense-plan.yaml` | expensePlan | 費用計画 |
| `plans/profit-plan.yaml` | profitPlan | 利益計画 |
| `plans/investment-plan.yaml` | investmentPlan | 投資計画 |
| `plans/property-revenue.yaml` | propertyRevenuePlan | 物件別収益前提 |
| `operations/kamezawa-public.yaml` | facilityPublic | 亀沢公開情報 |
| `operations/kamezawa-secrets.yaml` | — | 鍵・Wi-Fi（**gitignore**） |
| `document-io.yaml` | documentIo | **受信/出力トレイ台帳** |
| `dependency-graph.yaml` | dependencyGraph | **パラメータ依存関係マップ** |
| `hr/employees.yaml` | employeesFile | 従業員マスタ |
| `executive/calendar.yaml` | calendarFile | 社長カレンダー（Secretary） |
| `executive/tasks.yaml` | tasksFile | 社長タスク |
| `executive/one-on-ones.yaml` | oneOnOnesFile | 1-on-1 レジストリ |
| `executive/external-contacts.yaml` | externalContactsFile | 社外連絡先 |

---

## 参照整合性

CLI が自動検証する関係:

```
PROP.financing ──→ LOAN.id
LOAN.contract_id ──→ CTR.id (type: loan)
LOAN.property_id ──→ PROP.id
CTR.property_id ──→ PROP.id
expense-plan.contract_id ──→ CTR.id
operations.property_id ──→ PROP.id
```

---

## 運用コマンド

```bash
npm run validate              # スキーマ + 参照エラー
npm run validate -- --warnings  # 警告も表示
npm run steward -- status     # データ成熟度レポート
npm run steward -- sync all   # docs/exports CSV を YAML から再生成
npm run steward -- io status  # 受信/出力トレイ
npm run steward -- io guide   # I/O フロー
npm run steward -- deps check --file data/...  # 依存影響チェック
npm run steward -- deps graph # 依存関係マップ
```

---

## 更新手順

1. YAML を編集
2. `npm run steward -- deps check --file <編集したファイル>` — 下流の確認リスト
3. `npm run validate`（必要なら `--deps` で鮮度警告）
4. `npm run steward -- sync all`（CSV 利用時）
5. 必要なら `docs/` の MD を同期

詳細: [docs/plans/dependency-update-guide.md](../docs/plans/dependency-update-guide.md)

*機密・個情は `records/` または `*-secrets.yaml`（gitignore）のみ。*
