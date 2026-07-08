# Proposal 3 — 3-org Wire デモ — Proposal 3（Org C relay + trust bundle + mTLS）

**対象:** MAL **送信** · southwood **受信** · AIAC **Org C（中立 relay + WTA）** — 履行通知 **1通のみ**  
**正本スクリプト:** `scripts/seed-wire-console-three-org-demo.ts` · `npm run demo:wire-console-three-org`  
**CLI フルデモ（ack 返信あり）:** `npm run demo:inter-org` · [inter-org-two-org-demo.md](inter-org-two-org-demo.md)

---

## 前提

| 項目 | 値 |
|------|-----|
| Wire Console | `http://127.0.0.1:9470` |
| Org C Protocol API | `https://127.0.0.1:9486`（trust bundle + relay · **mTLS 必須**） |
| 有効テナント | **mal** · **southwood** · **aiac**（`wire_console: true`） |
| デモ seed | `npm run demo:wire-console-three-org` |

```bash
npm run demo:wire-console-three-org
npm run wire-console:build
npm run orgos -- wire console start
```

### 3 社の役割（Proposal 3）

| タブ | 役割 | Wire Console で見るもの |
|------|------|-------------------------|
| **mal** | **送信当事者** | **送信** 1件 — Org C relay へ POST（mTLS） |
| **southwood** | **受信当事者** | **受信** 1件 — Org C relay から pull（mTLS） |
| **aiac** | **Org C（中立）** | **確認待ち** 1件 · trust bundle 運用 |

共有 **event_id:** `a1b2c3d4-e5f6-4789-a012-3456789abcde`  
契約: **CTR-012**（`protocol.witness_trust_bundle_url` · `resilience_sla: gold`）

---

## 流れ（1通 · Proposal 3）

1. **AIAC（Org C）** — dev PKI 生成 · WTA 初期化 · HUB-A/B certify · `protocol api-serve :9486`（HTTPS + mTLS）
2. **MAL / southwood** — `protocol-api-client.yaml` に client cert · `flushWireRelayInbox` / relay POST は mTLS
3. **MAL** — 起案 → 承認 → outbox → **Org C `/relay/enqueue` へ配送**
4. **southwood** — **`flushWireRelayInbox`** で Org C から受信 · witness pool は trust bundle から pin
5. **AIAC** — 第三者として **確認待ち**（公証登録）

Mac mini 側は **アウトバウンド**（relay POST / pull）のみ。配送正本は各 Org の `tenants/`、relay キューは Org C の `wire-relay-queue.yaml`。

---

## 常駐デーモン（本番 / Mac mini）

```bash
npm run proposal3:setup          # PKI + client yaml + env 生成
npm run proposal3:org-c-api      # Org C API（別ホストでも可）
npm run proposal3:party-relay -- mal
npm run proposal3:party-relay -- southwood
```

systemd / launchd 手順: [deploy/proposal3/README.md](../../deploy/proposal3/README.md)

---

## 認証 · SSE · トラブルシュート

[runbook-orgos.md §18 Wire Console](../runbook-orgos.md) · [resilience-stack.md](resilience-stack.md)（Org C PKI · mTLS 本番）

*版: 2026-06-28 · Proposal 3（Org C relay + trust bundle + mTLS）*
