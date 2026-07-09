# Relay SLA — アラート · 運用 Runbook (W4-4)

**Parent:** [wire-hub-stack-pilot.md](wire-hub-stack-pilot.md) · [wire-score-98-tickets.md](wire-score-98-tickets.md)

---

## メトリクス（relay-worker）

`runRelayCycle()` が `relay-state.yaml` に記録:

| フィールド | 説明 |
|-----------|------|
| `wire_pending` | 未配送 wire キュー |
| `witness_pending` | witness 未 flush |
| `sla_failures` | resilience SLA 未達 TX 数 |
| `reconcile_alerts` | witness reconcile アラート数 |
| `relay_pulled` | Org C relay inbox pull 件数 |

## SLA 閾値（正本: `relay-sla-alert.ts`）

| コード | 条件 | severity |
|--------|------|----------|
| `relay-stale` | 最終 cycle から 60 分超 | critical |
| `wire-pending-high` | `wire_pending` > 10 | warning |
| `witness-pending-high` | `witness_pending` > 10 | warning |
| `sla-failures` | `sla_failures` > 0 | critical |
| `reconcile-alerts-high` | `reconcile_alerts` > 5 | warning |

## オペレータ手順

```bash
# relay 常駐確認
systemctl status steward-protocol-relay@mal

# 手動 1 cycle（メトリクス確認）
npm run orgos -- --tenant mal protocol relay run --once

# SLA 評価（テスト / 将来 CLI）
npm test -- tests/relay-sla-alert.test.ts
```

## アラート対応

1. **`relay-stale`** — systemd 再起動 · `install-mal-wire-systemd.sh`
2. **`wire-pending-high`** — peer endpoint 到達性 · `wire-gateway discover` · flush-pending
3. **`sla-failures`** — `resilience_sla` tier · witness hub 遅延 · contract protocol 確認

*改定: 2026-07-10 · W4-4*
