# 3-org Wire デモ — CLI · Wire Console 手順

**対象:** mal ↔ southwood（inter-org Phase 1）+ mal → southwood relay → aiac（mesh Phase 2）  
**正本スクリプト:** `scripts/demo-three-org-wire.ts` · `npm run demo:three-org-wire`  
**Wire Console 計画:** [wire-console-plan.md](wire-console-plan.md)

---

## 前提

| 項目 | 値 |
|------|-----|
| Wire Console | `http://127.0.0.1:9470`（BFF · 人間向け UI） |
| Protocol API | `http://127.0.0.1:9476`（peer 自動配送 · metrics） |
| 有効テナント | `southwood` · `aiac`（`wire_console: true`） |
| デモ seed | `npm run demo:three-org-wire` で Hub · peer · mesh 起動 |

```bash
npm run wire-console:build
npm run orgos -- wire console start
# 別ターミナル
npm run demo:three-org-wire
```

---

## Phase 1 — inter-org（Console のみ）

**southwood タブ** で以下を実行:

1. **ログイン** — passkey `orgos-dev` · approver `南木健一`（southwood 代表）
2. **Propose notice** — peer `PEER-002` · type `contract.execution.notice` · contract `CTR-012`
3. **Wire approvals** — 作成された NOTICE を **Approve**
4. **Outbox** — provenance 付き envelope が追加されることを確認
5. **Event detail → Workflow** — Approval → Outbox → Delivery → Witness ステップを追跡
6. **Delivery** — 未配送なら peer + event_id で Deliver、または **Flush pending**
7. **Witness** — event_id を指定して Register attestation · Verify

Phase 1 完了条件: southwood outbox に event · mal inbox に同一 event_id（Protocol API / webhook 稼働時）

---

## Phase 2 — mesh → aiac

Phase 2 は **mesh relay** 経路のため、現状は CLI デモと併用:

```bash
npm run demo:three-org-wire   # Phase 2 まで一括
```

Console では **aiac タブ** で inbox 到着を確認。mesh 配送自体は `demo:three-org-wire` が relay + webhook を起動。

---

## 認証モード

| モード | 環境変数 | ログイン |
|--------|----------|----------|
| **dev**（デフォルト） | — | POST `/console/v1/auth/login` `{ passkey, approver_id }` |
| **prod** | `WIRE_CONSOLE_AUTH=prod` · `WIRE_CONSOLE_PROD_TOKEN=…` | `{ prod_token, operator_id, approver_id }` — **passkey 不可** |

```bash
WIRE_CONSOLE_AUTH=prod WIRE_CONSOLE_PROD_TOKEN='your-token' \
  npm run orgos -- wire console start
```

---

## ライブ更新（SSE）

ログイン後、SPA は `GET /console/v1/events/stream`（SSE）を購読。snapshot fingerprint 変更時にテナントデータを自動 refresh。SSE 切断時は 5 秒ポーリングにフォールバック。

---

## トラブルシュート

| 症状 | 確認 |
|------|------|
| Console 401 | セッション cookie · 再ログイン |
| Approve 403 | approver が `company.yaml`  authorized と一致するか |
| Deliver queued | peer inbound URL · Protocol API 稼働 · Flush pending |
| Witness FAIL | Hub 起動 · `witness-pool.yaml` · flush witness pending |

詳細: [runbook-orgos.md](../runbook-orgos.md) §18

*版: 2026-06-28 · Wire Console Wave 3*
