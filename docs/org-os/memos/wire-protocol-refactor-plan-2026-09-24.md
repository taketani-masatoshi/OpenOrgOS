# Wire 通信・プロトコル 改訂リファクタ計画（検証済み）

**日付:** 2026-09-24  
**基準コミット:** `4090a741`（Core detached HEAD と同一）  
**作業場所:** `/Users/kk/OOO/task-wire-protocol-refactor` · ブランチ `refactor/wire-protocol-layers`  
**正本リポ:** `/Users/kk/OOO/Core`（finance 等の未コミット変更は触れない）

---

## 0. 作業前確認（事実）

| 項目 | 結果 |
|------|------|
| Core `core.hooksPath` | **unset**（未保護。傘 `scripts/install-hooks.sh` 未適用） |
| worktree `core.hooksPath` | **unset** |
| Core 作業ツリー | finance / product 等の大量未コミット変更あり → **直接編集禁止** |
| 隔離 | 既存 worktree を継続（同一基準コミット）。`ORGOS_TEST_DISPOSABLE_ROOT` は **この worktree のみ**（Core 本体を指定してガード回避しない） |
| commit / push / 実テナント | 今回の指示に含めない |

---

## 1. 静的調査の検証結果（鵜呑みにしない）

| 指摘 | 検証 | 判定 |
|------|------|------|
| TS 148 ファイル · 19,353 行（指定範囲） | `git ls-tree` + 行数集計 | **一致** |
| `schemas/protocol/` 52 ファイル | 同上 | **一致** |
| `protocol.ts` 2,416 行 · 公開関数 80 | `wc` + `^export (async )?function` | **一致** |
| `commands/protocol/*` は再エクスポート中心 | 各 7–40 行 · `from "../protocol.js"` | **一致（基準コミット）** |
| transport 重複 | `transport.ts` 468 行に DNS/inbound/relay/結果型が同居し、`transport/{dns,inbound,relay,types}.ts` にも同名 export | **一致。かつ中身は完全一致ではない**（下記） |
| protocol ↔ wire / wire-gateway 双方向 | protocol→wire-gateway/codec·dns·gov-gateway、wire-gateway→protocol/peers·signing·transport 等 | **双方向参照は確認。個別モジュールの循環は未断定（依存方向テストで追う）** |
| notice-transmit が配送と CLI 表示を兼ねる | `transmitApprovedNotice` + `formatNoticeTransmitConsole` が同ファイル。後者は `console.log` ではなく文字列配列生成 | **「兼ねる」は半分正しい。表示は既に純関数だがファイル同居** |
| layer-catalog が存在確認中心 | 基準コミットに **layer-catalog なし**。worktree では追加済み + 依存方向テストあり | **基準では未整備。worktree で一部充足、ファイル存在チェックだけでは不十分という指摘は妥当** |
| Core に無関係な未コミット多数 | `git status` | **一致** |
| Vitest がテナント復元・使い捨てガード | `tests/setup-restore-protocol.ts` · `assertDisposableTestWorkspace` | **一致** |

### Transport 重複の挙動差（重要）

| 関数 | `transport/transport.ts`（現行呼出元の大半） | `transport/{dns,inbound,relay}.ts` | 差 |
|------|-----------------------------------------------|--------------------------------------|----|
| `mirrorInboundEnvelope` | `serializeEventEnvelope` | `JSON.stringify(..., null, 2)` | **正規化差あり（ダイジェスト影響）** |
| `pullDeliverFromPeerOutbox` | 同一 | 同一 | 差なし |
| `resolvePeerInboundEndpointsWithDns` | ~96 行（フル） | ~27 行 | **実装欠落側あり** |
| `flushWireRelayInbox` / `pullOrgCRelayInboxIfConfigured` | dynamic import あり | static import | 挙動は近いが同一ではない |
| `DeliverEnvelopeResult` | types と同一 | types.ts | 差なし |

**結論:** 名前が同じだから統合してはいけない。呼出元の正本は現状 **`transport/transport.ts`**。モジュール分割ファイルは古い・不完全コピーの可能性が高い。

### 先行 worktree 作業の現状（再確認）

既に実施済み（未コミット）:

- CLI ハンドラ本体を `commands/protocol/<domain>.ts` へ移動 · 互換バレル削除
- `protocol/{core,transport,distribution,adapters,readiness}` 物理配置
- codec/DNS の transport 寄せ · gov-gateway 注入 · 依存方向ベースラインテスト · ADR 0079

**残課題（今回の改訂計画の主戦場）:**

1. Transport 二重実装の解消（挙動差の確定込み）
2. CLI 各ファイルに残る **巨大な共通 import 塊**（責務外モジュールまで import）の刈り込み
3. `formatNoticeTransmitConsole` の表示責務分離（任意だが推奨）
4. `transport/index.ts` が dns と transport の両方から同名を export している衝突の解消
5. 使い捨て checkout での回帰（Core を DISPOSABLE にしない）

---

## 2. 目標アーキテクチャ

### 責務

| 層 / 領域 | 正本 | やってよいこと | 禁止 |
|-----------|------|----------------|------|
| **core** | `src/lib/protocol/core/` | 署名・正規化・paths・validate・audit | transport / wire-gateway への依存 |
| **transport** | `src/lib/protocol/transport/` | 配送・Pull/Relay・peers・TLS API | readiness / commands への依存 |
| **distribution** | `.../distribution/` | witness · trust registry · hubs | adapters への依存 |
| **adapters** | `.../adapters/` | email / community / webhook | commands への依存 |
| **readiness** | `.../readiness/` | スコア · prod gate | （下位層への依存は可） |
| **wire** | `src/lib/wire/` | notice 承認ワークフロー · gov-gateway 実装 | CLI 表示文の生成 |
| **wire-gateway** | `src/lib/wire-gateway/` | HTTP gateway ·（codec/DNS は shim→transport） | |
| **commands** | `src/commands/protocol/` | CLI 入出力 · 表示整形 | ビジネスロジック新設 |

### 許容依存方向

```
commands → readiness | wire | wire-gateway | protocol/*
readiness → 任意の下位層
adapters → distribution → transport → core → schemas
wire / wire-gateway → protocol（transport/core/distribution）は可
protocol/core → wire* は禁止（循環防止）
```

### 互換入口（維持）

- CLI: `orgos wire`（正）· `orgos protocol` / `hub` / `wire-gateway`（互換）
- 旧パス shim: `src/lib/wire-gateway/codec.ts` 等（薄い再エクスポート）
- 公開関数名 · オプション · HTTP · 永続化パス · 承認/RBAC/署名契約

---

## 3. 段階計画

### ① 隔離環境で変更前の検証基準（完了条件）

- worktree を作業根とする（Core は触らない）
- `ORGOS_TEST_DISPOSABLE_ROOT=<worktree>` のみ
- 記録: typecheck（protocol 範囲）· lint · `test:contract` · `vitest` protocol/wire/witness 選定セット
- **完了:** 失敗一覧を「先行失敗 / 今回回帰」に分けてメモ
- **取り消し:** 作業なし（測定のみ）

### ② Transport 重複解消

**方針（推奨・仕様判断不要と判断）:**

1. `types.ts` を `DeliverEnvelopeResult` の唯一正本にする  
2. `dns.ts` / `inbound.ts` / `relay.ts` を **transport.ts 現行実装で上書き**（呼出元が参照している挙動を正とする）  
3. `transport.ts` は `deliver*` / `flushWirePending` のみ残し、DNS·inbound·relay はモジュールから import  
4. `index.ts` から同名の二重 export を削除（`export *` dns/inbound/relay + 必要なら deliver* のみ transport から）  
5. 旧ルート `protocol/transport.js` を要求する外部があれば薄い shim（現状ファイル無しなら不要）

**検証:** deliver / pull / relay / multipath / gateway outbound の選定テスト  
**取り消し:** `git checkout -- src/lib/protocol/transport/`

### ③ CLI ハンドラ import の責務刈り込み

- 各 `commands/protocol/<domain>.ts` から未使用・他ドメイン専用 import を削除
- ハンドラ実装の移動は済んでいる前提。**取りこぼし**（gov-gateway · api · tls · notice · transaction）を確認
- `formatNoticeTransmitConsole` は `notice.ts` または `shared.ts` へ移し、`notice-transmit.ts` は配送結果のみ返す（表示は commands）

**検証:** `cli-wire-surface-contract` · notice approve/transmit 系  
**取り消し:** domain ファイル単位で checkout

### ④ 依存境界の締め

- 依存方向テストのベースラインから、②③で消した違反を削除
- core → wire* が残っていれば注入 or 呼び出し側へ寄せ（挙動不変）
- layer-catalog の「存在だけ」検査を、依存スキャンと役割分担（動作は別テスト）と明記

**検証:** `protocol-dependency-direction` · 既存 wire 回帰  
**取り消し:** テスト・catalog の revert

### ⑤ 回帰 · ドキュメント

- 選定テスト再実行 + typecheck/lint
- ADR 0079 / CHANGELOG を Transport 重複解消内容で追記（既にあれば差分のみ）
- `orgos validate` の finance 失敗は **範囲外として記録**（黙って finance を直さない）

---

## 4. リスク

| リスク | 緩和 |
|--------|------|
| inbound の JSON.stringify 版がどこかで使われダイジェスト不一致 | index 経由 import を洗い、transport.ts 版へ一本化後に pull/deliver テスト |
| DNS 短縮版が index 経由で使われていた | 上書き後に multipath / openorg-dns テスト |
| CLI import 刈り込みで未使用に見せかけて実行時参照 | typecheck + ハンドラ単位テスト |
| 使い捨てでない Core で fixture restore | DISPOSABLE=worktree 厳守 |

---

## 5. 仕様選択が必要な場合のみ質問する事項

今回の実装では次を **推奨案で進行**（不一致が出たら停止して質問）:

- Transport 正本 = 現行 `transport/transport.ts` の挙動（serializeEventEnvelope 側）
- 表示整形 = commands 側へ移動（lib は構造化結果のみ）

停止条件: 署名ダイジェスト・承認ゲート・永続パスが変わる差分が出た場合。

---

## 6. 実装結果（2026-09-24 続）

### 実装済み
- Transport: `inbound.ts` を `serializeEventEnvelope` 正本に修正。`transport.ts` から DNS/inbound/relay を import 再エクスポート。`index.ts` の同名二重 export を削除。
- CLI: 各 domain の未使用 import を刈り込み（例: identity 244→169 行）。
- 表示: `formatNoticeTransmitConsole` を `commands/protocol/notice.ts` へ移動。
- `wire-setup.ts` の削除済み `protocol.js` 参照を `protocol/tls.js` へ修正。
- 依存ベースラインから解消済み `transport.ts → wire-relay-store` を削除。

### 検証済み（ORGOS_TEST_DISPOSABLE_ROOT=worktree）
- deliver-pull / multipath / wire-relay / relay-worker / pending-flush / dependency-direction / cli-wire-surface / signing / mal-peer-deliver / approval-gate — **pass**

### 未検証・範囲外
- 全量 `npm test` · `orgos validate`（finance `bs_class` 等は Core 側未コミット作業由来）
- `transport → distribution` の残ベースライン（relay.ts → wire-relay-store 等）の完全解消
