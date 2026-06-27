# Witness Hub — 運用ガイド

**Parent:** [witness-hub-requirements.md](witness-hub-requirements.md) · [inter-org-two-org-demo.md](inter-org-two-org-demo.md)

---

## 1. アーキテクチャ（v2）

```
Org (witness-pool.yaml)
  ├─ fan-out POST /hub/v1/attestations → HUB-A, HUB-B
  └─ quorum evaluate (Org 側)

HUB-A ←→ HUB-B  (attestation gossip · hub-federation.yaml)
  各 Hub が独立 SoT · 自 hub_id で receipt 再生成
```

**不変条件:** Wire 完了は Hub 成功に非依存 · Hub は editor ではない · receipt の `hub_id` は常に当該 Hub。

---

## 2. デプロイ（Docker Compose）

正本: [`deploy/witness-hub/docker-compose.yaml`](../../deploy/witness-hub/docker-compose.yaml)

```bash
cd deploy/witness-hub
docker compose up -d
curl http://127.0.0.1:9474/hub/v1/health
curl http://127.0.0.1:9475/hub/v1/health
```

各コンテナ:

| サービス | ポート | data-dir |
|---------|--------|----------|
| hub-a | 9474 | `./data/hub-a` |
| hub-b | 9475 | `./data/hub-b` |

起動後、`hub-init` サービスが **相互 federation** を自動 seed します（`deploy/witness-hub/seed-federation.ts`）。`--gossip-interval 300` で 5 分ごとに attestation 同期。

```bash
# federation 手動再 seed（Hub 再起動後など）
node --import tsx deploy/witness-hub/seed-federation.ts
```

---

## 3. プロセス管理（systemd）

例: [`deploy/witness-hub/systemd/steward-hub@.service`](../../deploy/witness-hub/systemd/steward-hub@.service)

```bash
# HUB-A インスタンス
sudo systemctl enable steward-hub@HUB-A
sudo systemctl start steward-hub@HUB-A
```

環境変数 `HUB_DATA_DIR` · `HUB_PORT` · `GOSSIP_INTERVAL_SEC` を unit で設定。

---

## 4. 初回セットアップ

```bash
# 1. Hub 起動 · 公開鍵取得
npm run steward -- hub serve --hub-id HUB-A --port 9474 --data-dir ./data/hub-a
npm run steward -- hub export-public-key --hub-id HUB-A --data-dir ./data/hub-a

# 2. Federation peer 登録
npm run steward -- hub federation add-peer \
  --hub-id HUB-A --data-dir ./data/hub-a \
  --peer-id HUB-B --peer-url http://127.0.0.1:9475

# 3. Org witness pool（trusted_hubs から bootstrap）
npm run steward -- --tenant mal protocol witness pool init-trusted --jurisdiction JP
```

---

## 5. 鍵管理

| 鍵 | パス | 備考 |
|----|------|------|
| Hub 署名鍵 | `{data_dir}/signing-key.pem` | **gitignore** · バックアップ必須 |
| Org protocol 鍵 | `tenants/{id}/data/protocol/signing-key.pem` | attestation 署名 |

**ローテーション:** 新鍵生成 → `hub_public_key` を witness-pool / federation 更新 → 旧鍵は猶予期間後削除。

---

## 6. バックアップ

Hub `data_dir` 内の必須ファイル:

- `witness-attestations.jsonl`
- `witness-receipts.jsonl`
- `registered-orgs.yaml`
- `merkle-anchors/*.json`
- `hub-federation.yaml`
- `gossip-cursor/*.json`
- `signing-key.pem`（別途暗号化バックアップ推奨）

```bash
tar czf hub-a-backup-$(date +%Y%m%d).tar.gz -C data/hub-a .
```

---

## 7. 監視

| チェック | コマンド / URL |
|---------|----------------|
| Hub health | `GET /hub/v1/health` |
| Gossip lag | `hub federation show` · cursor ファイルの `updated_at` |
| Org pending | `protocol witness flush-pending` |
| Quorum | `protocol witness verify --event-id <uuid>` |
| Cross-hub drift | `protocol witness reconcile --peer PEER-001 --cross-hub` |
| Merkle anchor | `hub anchor-verify --hub-url http://...` |

---

## 8. 復旧手順

### 単一 Hub 停止

1. Org 側: `any_of_n` quorum なら他 Hub で継続
2. Hub 復旧後: `hub gossip sync-all` で backfill

### Org → Hub 到達不可（partition）

1. 到達可能 Hub に attestation 到達
2. `hub gossip sync --peer <reachable>` で他 Hub へ attestation 伝播
3. 各 Hub が **自 hub_id** で receipt 再生成

### Hub 全損

1. Org: `protocol witness flush-pending` で attestation 再送
2. peer Hub から `hub gossip sync` で backfill（peer が生きている場合）
3. バックアップから `data_dir` 復元

---

## 9. CLI リファレンス（v2 追加分）

```bash
# Federation
steward hub federation show --hub-id HUB-A --data-dir ./data/hub-a
steward hub federation add-peer --hub-id HUB-A --peer-id HUB-B --peer-url ...

# Gossip
steward hub gossip sync --hub-id HUB-B --peer HUB-A
steward hub gossip sync-all --hub-id HUB-A
steward hub serve --gossip-interval 300 ...

# Merkle
steward hub anchor-export --hub-id HUB-A --date 2026-06-26
steward hub anchor-verify --hub-url http://127.0.0.1:9474

# Org
steward protocol witness pool init-trusted --jurisdiction JP
steward protocol witness reconcile --peer PEER-001 --cross-hub
```

---

## 10. セキュリティ推奨

- 本番: リバースプロキシ + TLS（mTLS 推奨）
- `registered-orgs.yaml` の org 公開鍵 pin を維持
- envelope 全文は Hub に載せない（digest のみ · N-04）
