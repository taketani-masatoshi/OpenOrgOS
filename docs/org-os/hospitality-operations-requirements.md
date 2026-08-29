# Hospitality 日常運用 — 要件要約

**Status:** 2026-07-14 · 税カレンダー / Today / 清掃証拠 / 破損 / 定期タスク対応  
**モジュール:** `hospitality`（業許可取得は `jp_permit_application` / registry 側）

## ゴール

許可取得後の滞在台帳 · 名簿 · 清掃（報告・責任） · ゲスト案内生成 · 鍵 · **宿泊税（算定〜申告パック〜納付記録・Today 事前リマインド）** · OTA 取込 · ID vault · 破損証拠 · 定常タスク · KPI。

## CLI

`orgos operations hospitality …`

| 領域 | コマンド |
|------|----------|
| 滞在 | stays · show · stay-upsert · check-in · check-out |
| 名簿 | register-append · register-validate · records-check |
| 清掃 | cleaning-order · cleaning-complete · **cleaning-report** · **cleaning-accept** · **cleaning-issue** · **cleaning-message** |
| 税 | tax-compute · tax-pay · **tax-status** · **tax-pack** · **tax-filed** |
| 破損 | **damage-log** · **damage-evidence** · **damage-claim** |
| 定期 | **ops-due** · **recurring-list** · **recurring-complete** |
| その他 | guest-message · access-code · ota-import · id-docs-* · metrics · blockers |

## Today / 秘書連携

- `buildTodayContext` → `hospitality_ops_due`（`## 旅館運用（期限・事前）`）
- 宿泊税は **申告月の初日から表示**（期限当日だけの通知にしない）。`lead_days: [14, 7]` でエスカレート
- P0 は Today「判断」にも最大 2 件マージ

## データ

| ファイル | 層 |
|---------|-----|
| `data/operations/stays.yaml` | L1 |
| `data/operations/lodging-tax*.yaml` | L1（filing · period_filings 含む） |
| `data/operations/cleaning-reports.yaml` | L1（Drive URL / path のみ） |
| `data/operations/damage-incidents.yaml` | L1 |
| `data/operations/ops-recurring.yaml` | L1 |
| `data/operations/id-doc-index.yaml` | パスのみ |
| `data/operations/access-codes.yaml` | L2 gitignore |
| `docs/.../operations/records/` · `tax-packs/` | L2 / 生成物 |

## 禁止

- チャットへの PII / 鍵 / 旅券 / 写真バイト出力
- 行政・OTA・Drive への自動アップロード（URL・パス記録と文面生成のみ）
