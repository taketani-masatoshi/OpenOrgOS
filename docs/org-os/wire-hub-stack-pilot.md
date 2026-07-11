# Wire + Hub スタックパイロット — ギャップ閉じ計画

**Status:** 実装済（2026-07-09）  
**Parent:** [wire-gateway-requirements.md](wire-gateway-requirements.md) · [witness-hub-requirements.md](witness-hub-requirements.md)

---

## 目的

前回評価で「弱い / 未完了」とされた項目のうち、**コード・設定・CI で閉じられる範囲**を mal テナント参照実装として完遂する。

---

## 実施項目

| # | ギャップ | 対応 |
|---|---------|------|
| 1 | mal `wire-gateway.yaml` 未配置 | `orgos wire-gateway init` · `init-tenant-wire-pilot.sh` |
| 2 | mal `gov-gateway.yaml` 未配置 | seed コピー + live pilot 手順 |
| 3 | witness pool がデモ localhost 固定 | JP trusted hubs（9474/9475）に統一 |
| 4 | peers が legacy / webhook 中心 | `peers.yaml` + `wire-gateway discover --suggest` |
| 5 | wire-export-policy 未配置 | mal 用 policy 追加 |
| 6 | ブートストラップ手順なし | `scripts/init-tenant-wire-pilot.sh` |
| 7 | Hub + relay スモークなし | `scripts/wire-hub-stack-smoke.sh` · `deploy/mal-pilot/` |
| 8 | `doctor --wire-prod` FAIL | init + prod gate |
| 9 | wire-gateway init CLI なし | `orgos wire-gateway init` |
| 10 | CI で mal ゲート未検証 | `tests/mal-wire-pilot-gate.test.ts` |
| 11 | Gateway Federation / Discovery v2 | `wire-gateway discover` · `wire-gateway federation list` |
| 12 | オペレータ TLS/registry/relay | `scripts/setup-mal-wire-operator.sh` |

## オペレータ残作業（コード外）

| 項目 | 内容 | 自動化 |
|------|------|--------|
| TLS | Mode A ACME / Mode B 本番証明書 | runbook · `wire-gateway tls-init`（dev のみ） |
| Hub 法域拡張 | EE/AE/… の `hub_public_key` pin | `protocol trusted-hubs-validate` |
| oorgos.org 配信 | `./scripts/publish-protocol-registry.sh` → CDN | スクリプトあり · CDN は operator |
| 実 SS / Gov token | `GOV_XROAD_*` 本番値 | env 設定 |
| relay 常駐 | systemd / Docker profile | `setup-mal-wire-operator.sh --install-systemd` |

---

## 検証コマンド

```bash
# 設定 + オペレータセットアップ（TLS/registry/relay 手順込み）
./scripts/setup-mal-wire-operator.sh

# 設定のみ
./scripts/init-tenant-wire-pilot.sh mal

# v2 discovery
npm run orgos -- --tenant mal wire-gateway discover --suggest
npm run orgos -- wire-gateway federation list

# 本番ゲート（STRICT）
./scripts/prod-validate-wire.sh mal

# Hub 起動 + スモーク（Docker 必要）
./scripts/wire-hub-stack-smoke.sh mal

# relay 常駐
npm run orgos -- --tenant mal protocol relay run --interval-sec 30
```

---

## アーキテクチャ

```
[mal OrgOS Core]
  ├── wire-gateway.yaml ──► Wire Gateway (8443 / Mode A proxy)
  ├── witness-pool.yaml ──► HUB-A/B (9474/9475)
  ├── peers.yaml ──► wire_v1 | gov_gateway | relay
  └── protocol relay run ──► wire-pending + witness-pending flush
```
