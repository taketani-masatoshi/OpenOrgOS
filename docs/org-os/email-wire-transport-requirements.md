# Email-Wire Transport（R5）— 要件定義

**Status:** 2026-07-10 · Phase 1 outbound · Phase 2 inbound  
**Parent:** [resilience-stack.md](resilience-stack.md) · [wire-gateway-wire-protocol.md](wire-gateway-wire-protocol.md)  
**Related:** [wire-node-governance.md](wire-node-governance.md) · [inter-org-operator-model.md](inter-org-operator-model.md)

---

## 1. 目的

OrgOS 組織間 Wire 配送において、HTTPS wire_v1 / Org C relay が利用不能な環境（ノート PC オフライン · ファイアウォール · 常駐 VPS なし）でも **署名付き EventEnvelope** を store-and-forward する **第3経路** を提供する。

Secretary 人間向けメールとは **専用アドレス・専用 SMTP 設定** で分離する。

---

## 2. スコープ

| Phase | 内容 |
|-------|------|
| **Phase 1** | Outbound `email_wire` · delivery-attempts 台帳 · trust-registry governance |
| **Phase 2** | IMAP `mail intake wire scan` → protocol inbox ingest |
| **Phase 3** | Steward Chat UI · rate limit · 大容量分割 |

---

## 3. 不変条件（Must）

1. approve 前に外部配送しない（[`pre-deliver-gate.ts`](../../src/lib/protocol/pre-deliver-gate.ts)）
2. 信頼の根は Ed25519 署名 — SPF/DKIM は補助ログのみ
3. envelope 全文は L2（`records/executive/wire-sent/`）— tracked MD に payload 禁止
4. `event_id` 冪等 — 再配送は idempotent skip
5. 経路優先: `wire_v1` < `relay` < `email_wire` < `wire-pending`（`priority` 昇順）
6. Human mail ≠ Wire mail（`wire_outbound.from` 分離）

---

## 4. MIME フォーマット（Outbound）

```
From: wire-notices@{org}
To: {peer.wire_email}
Subject: [OpenOrgOS] {event_id 先頭8文字}
X-OpenOrgOS-Wire-Version: 0.1
X-OpenOrgOS-Event-Id: {uuid}
X-OpenOrgOS-Sender-Did: did:ooo:org:…
X-OpenOrgOS-Transport: email_wire
Content-Type: multipart/mixed
  text/plain — 固定短文（業務データなし）
  application/vnd.openorgos.wire+json — WireMessage JSON
```

---

## 5. 異常系マトリクス

| ID | 異常 | 動作 |
|----|------|------|
| E1 | HTTPS 5xx/timeout | 次 endpoint → email → pending |
| E2 | relay 403 | email → pending |
| E3 | SMTP 4xx/5xx | pending · relay worker 再試行 |
| E4 | wire_email 未設定 | skip email_wire |
| E5 | envelope 未署名 | 配送拒否 |
| E6 | 既 delivery 済 | idempotent skip |
| E7 | 重複 ingest（Phase 2） | idempotent |
| E8 | 鍵 registry 不一致 | 受信拒否 |
| E9 | 未知 DID | 受信拒否 |
| E10 | 署名 invalid | 拒否 |
| E11 | サイズ >1MB | fail · pending |
| E12 | 自社 wire_email へ送信 | 拒否 |
| E13 | strict trust · registry 未登録 | email_wire 禁止 |
| E14 | SMTP AUTH 失敗 | pending · doctor warning |
| E15 | SMTP 成功 · 相手未 ingest | attempt success（Phase 2 まで witness 未） |

---

## 6. CLI

```bash
orgos protocol trust-registry submit --tenant mal --wire-email wire@example.com
orgos protocol trust-registry decide --request-id UUID --approve --decided-by CHAIR
orgos protocol deliver status --event-id UUID --peer PEER-001
orgos mail intake wire scan [--since-days 7]   # Phase 2
```

---

## 7. 関連

- [wire-trust-registry.md](wire-trust-registry.md)
- [ceo-communication-ux.md](../../steward/rules/ceo-communication-ux.md)
