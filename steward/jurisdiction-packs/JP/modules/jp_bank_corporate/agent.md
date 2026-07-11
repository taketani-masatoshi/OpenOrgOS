# JP Bank Corporate Module Agent（法人口座・資金繰り）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_bank_corporate/agent.md`
**Catalog id:** `jp_bank_corporate` · **管轄:** Finance / Treasury Agent（proxy）· **法域:** JP のみ

## 役割

JP 法人口座の **資金繰り表** · **キャッシュポジション** · **支払カレンダー** · **売掛・買掛台帳** を決定論 CLI で生成・検証する。振込実行は `broker transfer` に委譲。

## データ

| パス | 層 | 内容 |
|------|-----|------|
| `data/finance/cash-balance.yaml` | テナント | 期首現預金（口座別 · confirmed） |
| `data/finance/payment-calendar.yaml` | テナント | 日付固定支払 |
| `data/finance/ar-ap-ledger.yaml` | テナント | 売掛・買掛 |
| `data/finance/collection-terms.yaml` | テナント | 回収・支払サイト |
| `data/finance/monthly/{YYYY-MM}.yaml` | テナント | 月次実績 |
| `data/plans/yojitsu-fy*.yaml` | テナント | 予実（capex） |
| `data/plans/debt-plan.yaml` | テナント | 借入返済 |
| `docs/finance/treasury/cashflow-schedule/` | 生成 | 資金繰り表 MD/CSV |

`data/finance/payment-calendar.yaml` が支払日程の正本。`calendar import` は既定 dry-run で、`--write` 後に `orgos validate` を実行する。

## CLI

```bash
npm run orgos -- jp bank cashflow generate --granularity weekly --horizon 13w --write
npm run orgos -- jp bank position show
npm run orgos -- jp bank calendar validate
npm run orgos -- jp bank calendar import --from payroll|tax|yojitsu|contracts
npm run orgos -- jp bank ar-ap list|validate|sync --from invoices
npm run orgos -- jp bank cashflow export --template cash-book-csv
npm run orgos -- validate
```

Chat からの read-only 確認は `operator_validate_status`（`chat:read`）。返却は件数と L1-safe な repo 相対 path/message のみ。
自然言語例: 「13週資金繰りを生成」は preview、「13週資金繰りを保存して」は `ORGOS_LLM_TOOLS_WRITE=1` + `git:write` のときだけ書き込む。

資金不足は schedule の `shortfall_date` と、最深不足に必要な `required_funding_amount` / `required_funding_by_date` を分けて扱う。

## Skill

| Skill | CLI |
|-------|-----|
| `jp-cashflow-schedule` | `jp bank cashflow generate` |
| `jp-treasury-position` | `jp bank position show` |

## 禁止

- 口座番号・支店コードの tracked 出力（`bank_account_id` リンクのみ）
- 振込実行の自動決定

## 関連

- 仕様 Path: `docs/org-os/jp-bank-corporate-cashflow-spec.md`
- スキーマ Path: `schemas/jp-bank-corporate.ts`
- Agent Path: `steward/core/agents/finance_agent.md`
