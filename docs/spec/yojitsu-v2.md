# yojitsu v2 スキーマ

Steward OS の予実（yojitsu）正データ形式。**v2** では MAL 固定列（`revenue_bancho` 等）を廃止し、`business-plan.yaml` の `segments[].name` と連動する **`lines[]`** で計画・実績を表現する。

## ファイル

| パス | 説明 |
|------|------|
| `data/plans/yojitsu-{fy}.yaml` | 会計年度ベース（例: `yojitsu-fy2026.yaml`） |
| `data/plans/yojitsu-{calendar}.yaml` | カレンダー年（例: `yojitsu-2026.yaml`） |

## v2 トップレベル

```yaml
schema_version: 2          # 省略可（lines[] があれば v2 とみなす）
year: 2026
fiscal_year: "FY2026"
period_from: "2026-02"
period_to: "2027-01"
closing: { status: open | closed, basis: actual | forecast, ... }
summary: { revenue_total, operating_profit, ... }   # 任意 · PL 集計の上書き
months: [...]
```

## 月次 `lines[]`

各月の `plan` / `actual` は **lines 配列** を正とする。

```yaml
months:
  - month: "2026-02"
    plan:
      lines:
        - segment: "港湾マンション501（賃貸）"   # business-plan segments[].name と一致
          kind: revenue                         # revenue | expense | depreciation | capex
          amount: 80000
          label: "賃貸収益"                     # 任意 · 表示名上書き
    actual:
      lines:
        - segment: "港湾マンション501（賃貸）"
          kind: revenue
          amount: 80000
```

### `kind` の意味

| kind | 用途 |
|------|------|
| `revenue` | 売上（セグメント別） |
| `expense` | 運営費・販管費 |
| `depreciation` | 減価償却 |
| `capex` | 設備投資（CF 用 · PL には通常含めない） |

### 内部セグメント（任意）

| segment | 用途 |
|---------|------|
| `_corporate` | 本社共通（`label` で「役員報酬」等を指定） |
| `_investment` | 横断 capex（`label`: 設備投資） |

## business-plan との関係

1. `data/plans/business-plan.yaml` の `segments[].name` をセグメント名の正本とする。
2. yojitsu の `lines[].segment` は上記 `name` と **完全一致** を推奨（CLI `finances variance` がセグメント名を表示）。
3. 新規テナントは v2 のみ作成。MAL 既存ファイルは v1 のまま置ける。

## v1 互換（MAL レガシー）

v1 固定列は **読込時のみ** `src/lib/yojitsu-normalize.ts` が v2 `lines[]` に変換する。ファイル自体は移行不要。

| v1 フィールド | 変換先 segment（MAL） |
|--------------|----------------------|
| `revenue_bancho` | 番町ハイム312（賃貸） |
| `revenue_kamezawa` | 亀沢旅館（1棟貸し） |
| `revenue_translation` | 翻訳・通訳（不動産） |
| `revenue_services` | DX・ソフトウェア |
| `expense_*` / `depreciation` / `capex` | 同上マッピング表参照 |

Zod: `schemas/finance.ts` の `yojitsuMonthSideRawSchema` が v1 / v2 両方を受理。

## 移行スクリプト

v1 YAML を v2 ファイルに書き出す場合:

```bash
npm run steward -- migrate yojitsu --fy FY2026 --dry-run
npm run steward -- migrate yojitsu --fy FY2026 --write
```

実装: `src/lib/yojitsu-normalize.ts` の `serializeYojitsuPlanV2()`。

## 利用 CLI / lib

| コマンド / モジュール | 動作 |
|----------------------|------|
| `steward finances variance` | セグメント別売上表 + 月次差異 |
| `src/lib/dashboard.ts` | 月次トレンド · CF 補正 |
| `src/lib/kessan-pdf.ts` | 決算 PL 行を segments から動的生成 |
| `loadYojitsuFyPlan()` | 常に正規化済み `YojitsuPlan` を返す |

## 関連スキーマ

- `schemas/finance.ts` — `yojitsuLineSchema`, `yojitsuPlanSchema`
- [spec-v0.3.md](../spec-v0.3.md) — Steward OS 全体仕様（正本）
- [yojitsu v2](spec/yojitsu-v2.md) — 予実 `lines[]` スキーマ
