# data/ — 正データカタログ（テナント: mal）

**Source of Truth:** このディレクトリの YAML のみ。人向け表は `docs/exports/*.csv`（`steward sync all` で生成）。

**物理パス:** `tenants/mal/data/` · **論理パス:** CLI · Agent では `data/` と表記。

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
| `finance/cash-balance.yaml` | cashBalance | 現預金残高（L1 · `bank_account_id` でリンク） |
| `finance/bank-accounts.yaml` | bankAccountsFile | 法人口座番号（**gitignore** · `.example` 参照） |
| `classification-registry.yaml` | classificationRegistry | 機密階層 L0–L3 · エージェントアクセス |
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
| `executive/external-contacts.yaml` | externalContactsFile | 社外連絡先（索引） |
| `executive/stakeholders.yaml` | stakeholdersFile | 利害関係者（**gitignore** · `.example` 参照） |

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

*機密・個情は `records/` または `*-secrets.yaml` / `bank-accounts.yaml`（gitignore）のみ。*

**口座セットアップ:** `cp data/finance/bank-accounts.yaml.example data/finance/bank-accounts.yaml` → 三井住友・GMOあおぞらの口座番号を入力。

**分類チェック:** `npm run steward -- classification check`  
**振込 Broker:** `npm run steward -- broker transfer --from BANK-001 --amount 100000 --payee "..." --reference "..." --write`
