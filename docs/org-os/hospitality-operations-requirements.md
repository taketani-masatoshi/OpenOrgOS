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

## OTA 取込（`ota-import`）

公式 API は使わず、OTA のエクスポートファイルを取り込む。再取込しても重複しない。

| 入力 | 取り込む値 | 注意 |
|------|-----------|------|
| 汎用 CSV（`check_in,check_out,party_size,channel,rate_per_night_jpy,ota_ref`） | 全列 | `check_in` / `check_out` 列が無ければ停止 |
| Airbnb 予約 CSV（英語 UI のエクスポート。列名で自動判定） | 予約番号 · 日付（MM/DD/YYYY）· 人数（大人＋子ども。乳幼児は除く）· ステータス | ゲスト名・連絡先は読まない。「Earnings」はホスト受取額で宿泊料金ではないため、料金は未設定のまま |
| iCal（`--format ical`） | 日付 · UID | Airbnb のフィードは自動判定し、「Not available」のブロック日を除外。人数は 1、料金は未設定。他 OTA は `--channel` で指定 |

Airbnb のステータスは、Confirmed → booked、Currently hosting → checked_in、Past guest → checked_out（清掃は対象外 `na`）に対応させる。キャンセルは取込済みの滞在を cancelled にし、Pending / Request 等の未確定予約は取り込まない。不明なステータスや読めない日付があれば、何も書かずに停止する。

宿泊料金（`rate_per_night_jpy`）が未設定の滞在が対象月にあると、`tax-compute` は宿泊税を 0 円として扱わずに停止する。`stay-upsert --rate`（iCal 取込分は `--party-size` も）で補完してから再計算する。料金 0 円を明示した滞在は計算する。

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
