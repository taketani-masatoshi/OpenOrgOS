# OrgOS Ledger — オンコール手順

**対象:** OrgOS 運用（マネージド単一テナント）  
**関連:** [sla.md](sla.md) · [status.md](status.md) · `product-fleet/support.yaml`

## 役割

| 役割 | 出典 | 内容 |
|------|------|------|
| 一次 | `support.yaml` → `oncall.primary` | アラート初動 · 顧客連絡の窓口 |
| 二次 | `oncall.secondary` | 一次が応答できない場合のエスカレーション |
| 連絡 | `oncall.contact` / `email` | メール · チケット |
| 営業時間外 | `oncall.after_hours` | webhook 優先、未設定時はメール |

## 監視ループ（5 分）

```bash
# launchd: deploy/launchd/com.openorgos.ledger-monitor.plist
orgos ledger product monitor --fail-on-unhealthy
```

- unhealthy / `past_due` 時: `escalation_webhook`（または `ORGOS_LEDGER_ALERT_WEBHOOK`）へ POST
- webhook 未設定時: モニターは成功終了するがアラートは飛ばない（設定漏れに注意）

## 疎通ドリル（障害を起こさない）

```bash
# 実 webhook には送らず、ペイロードだけ確認
orgos ledger product monitor --alert-dry-run --json

# 実 webhook へテスト POST（staging URL を推奨）
ORGOS_LEDGER_ALERT_WEBHOOK=https://hooks.example/xxx \
  orgos ledger product monitor --alert-dry-run
```

`--alert-dry-run` はフリートが healthy でも 1 通のテストペイロードを組み立てる。  
`--json` 併用時は送信せず JSON に `alert_dry_run` を載せる。

## 初動チェックリスト

1. `orgos ledger product fleet-health --json` で対象テナントを特定
2. `orgos ledger product billing-issues` で `past_due` 有無を確認
3. [status.md](status.md) を更新（顧客向けステータス）
4. 復旧後に monitor を再実行し、webhook が沈黙することを確認
5. 四半期: restore drill（SLA 計測表参照）

## 設定

- SSOT: `product-fleet/support.yaml`
- 本番 webhook: 空文字を本番 URL に置換（git に秘密を入れない場合は `ORGOS_LEDGER_ALERT_WEBHOOK`）
