# ファイルベース会計運用 — Accounting Agent Runbook

**株式会社MAL** · **方針:** 外部会計 SaaS **非導入**  
**正本:** YAML（`data/finance/`）· **人間可読:** CSV/MD（`docs/finance/accounting/records/`）  
**Agent:** [accounting_agent.md](../../../../../../steward/core/agents/accounting_agent.md)

---

## 1. 設計原則

| 層 | 役割 | 形式 |
|----|------|------|
| **SSOT** | 仕訳・残高・固定資産 | YAML（append-only 仕訳） |
| **人間台帳** | 税理士提出・監査・スプレッドシート | CSV（records/） |
| **経営指標** | ダッシュボード・予実 | YAML + `orgos dashboard` / `orgos ledger` |
| **Agent** | 記帳・突合・月次 close | Skills + CLI（LLM は判断のみ） |

会計ソフトに代わるのは **`orgos ledger`** エンジン（GL · 試算表 · 月次突合）と **Accounting Agent** の手順書です。

---

## 2. 帳簿マップ

```
[銀行 CSV] ──import──► bank-statements.yaml
[領収書 inbox] ──index──► 領収書索引.csv + document-io
[経費申請] ──approve──► expense-claims.yaml ──► journal-entries.yaml
[請求発行] ──invoice-generate──► journal-entries.yaml（4200/2160/1150）
[減価償却] ──depreciation──► journal-entries.yaml
[月次 P/L] ──monthly-pl──► journal-entries.yaml
                              │
                              ▼
                    orgos ledger gl / trial-balance
                              │
              monthly-reconcile ◄── monthly/*.yaml · yojitsu
                              │
                    dashboard · 経営指標 MD 出力
```

---

## 3. 日次〜月次ワークフロー

### 日次
1. 銀行明細 CSV があれば `orgos jp bank statement import --file ... --write`
2. 現金出納帳 CSV（records/）に入出金 1 行追記（YAML と照合）

### 支出発生時
1. 領収書 → `docs/io/inbox/` · 領収書索引.csv に 1 行
2. 経費精算台帳.csv + `expense-claims.yaml`（取込時に claims へ追記）
3. 承認後 `orgos ledger post` または expense-claim パイプライン

### 月次締め（Accounting Agent）
```bash
STEWARD_TENANT=mal orgos finances close --month YYYY-MM
STEWARD_TENANT=mal orgos ledger post --source depreciation --month YYYY-MM
STEWARD_TENANT=mal orgos ledger post --source monthly-pl --month YYYY-MM
STEWARD_TENANT=mal orgos ledger monthly-reconcile --month YYYY-MM
STEWARD_TENANT=mal orgos ledger trial-balance --as-of YYYY-MM-DD
STEWARD_TENANT=mal orgos validate
```

### 税理士提出物
- 試算表・科目別元帳: `orgos ledger trial-balance` / `orgos ledger gl` の MD 出力
- 試算表: `orgos ledger export --template trial-balance-csv --as-of YYYY-MM-DD`
- 仕訳一覧: `orgos ledger export` または `skills run journal-export-csv`
- 領収書: `docs/io/inbox/` + 領収書索引.csv

---

## 4. 保存期間

| 帳簿 | 年数 |
|------|:----:|
| 仕訳帳 · 総勘定元帳 | 10 |
| 領収書 · 経費精算 | 7〜10 |
| 固定資産台帳 | 10 |

---

## 5. 電子帳簿保存法（参考）

- 検索: `entry_id` · `date` · `account_code` · `description` で YAML/CSV 索引
- 改ざん防止: 仕訳 **append-only**（訂正は逆仕訳）
- タイムスタンプ: `occurred_at` · Git 外 records/ の更新日

---

## 6. 関連

- [accounting-policy.md](../accounting-policy.md)
- [chart-of-accounts.yaml](../../../../data/finance/chart-of-accounts.yaml)
- [general-ledger-spec.md](../../../../../../docs/org-os/general-ledger-spec.md)
- [ADR 0041 GL native](../../../../../../docs/adr/0041-gl-native-ledger.md)
