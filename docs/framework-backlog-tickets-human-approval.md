# Human-final approval · Event ledger integrity — チケット

**日付:** 2026-08-23  
**Epic:** HA-0  
**正本:** [framework-backlog.md](framework-backlog.md) · [operator-policy.md](../steward/rules/operator-policy.md)  
**Work Order:** `tenants/mal/docs/reports/routing-queue/IMP-20260823-00{1–7}`  
**品質ゲート（全チケット共通）:** 下記「共通 DoD」

ポリシー「AI は提案のみ、最終承認は人間」と、Company Event 台帳の改ざん耐性をコードで保証する。実装は **HA-1 → HA-6 の順**。前チケットの受け入れを満たしてから次へ進む。

**やらないこと（全チケット共通）**

- MAL チェーンの `backfill --force` 復旧
- 既存イベントファイルの削除・巻戻し
- 履歴復旧が必要な場合は別 Epic（復旧イベント + 新しい署名済み Genesis）

---

## 状態

| ID | 優先 | 内容 | 状態 | 依存 | Work Order |
|----|:----:|------|:----:|------|------------|
| **HA-0** | P0 | Epic · 計画と品質ゲート | [x] | — | IMP-20260823-001 |
| **HA-1** | P0 | LLM/MCP 承認ツール削除 · 本番フラグ拒否 · テスト反転 | [x] | HA-0 | IMP-20260823-002 |
| **HA-2** | P0 | 承認者バインド · ceo/approver ロール · 自己承認全件 | [x] | HA-1 | IMP-20260823-003 |
| **HA-3** | P0 | events CLI 認証 · `events:write` · `--force` / `skipChain` | [x] | HA-1 | IMP-20260823-004 |
| **HA-4** | P0 | company-events テストの一時テナント隔離 | [x] | HA-3 | IMP-20260823-005 |
| **HA-5** | P1 | HumanApprovalContext · ADR 改訂 · Dev MCP 緩和閉鎖 | [x] | HA-2 | IMP-20260823-006 |
| **HA-6** | P2 | Witness 固定 · write guard · doctor 整合 | [x] | HA-3, HA-5 | IMP-20260823-007 |

各チケット完了時: 本表の状態を `[x]` にし、Work Order を `escalate complete` する。

---

## 共通 DoD（毎回確認）

実装に入る前と、各チケット完了時に次を満たす。

- [ ] 受け入れテストが追加され、**失敗ケース**（AI 承認、自己承認、無認証 CLI、mal 汚染）をカバーする
- [ ] 対象テストが通る（最低 `npx vitest run <対象ファイル>`）
- [ ] `npm run typecheck`
- [ ] `src/` · `schemas/` 変更時は `npm run lint`
- [ ] 仕様変更時は ADR / `operator-policy.md` / `docs/operator-production.md` / 該当 runtime.yaml を同期する
- [ ] デッドコード・矛盾したコメント・「CEO なら approve ツールを出す」旧仕様の文章が残っていない
- [ ] L2/L3 を tracked MD · テスト fixture に書いていない
- [ ] 憲章 §11 Definition of Done

---

## HA-0 — Epic

**件名:** 人間最終承認の保証と Company Event 台帳の改ざん耐性  
**担当:** engineering（レビュー: security）

監査指摘の中核は妥当。現状は「AI が承認を実行できる」「CLI が無認証でイベントを変えられる」「テストが MAL 台帳を汚染する」を塞げていない。

**完了条件:** HA-1〜HA-6 がすべて `[x]`。本 Epic 単独ではコードを変えない。

---

## HA-1 — LLM/MCP から承認実行を外す

**優先度:** P0  
**依存:** HA-0

### 背景

`ORGOS_LLM_TOOLS_WRITE=1` かつセッションに `chat:approve` があると、LLM が `operator_approve` を `tool_choice: auto` で即実行する。MCP `steward_approve` は write フラグ不要。本番 checklist は当該フラグを監視しない。

### 実装要件

1. [`src/lib/operator-runtime/tools.ts`](../src/lib/operator-runtime/tools.ts) から `operator_approve` を削除する。`ORGOS_LLM_TOOLS_WRITE=1` でも承認ツールは出さない。フラグは非承認の書き込み（資金繰り等）に残してよい。
2. [`src/lib/mcp/tools.ts`](../src/lib/mcp/tools.ts) から `steward_approve` を削除する。人間の実行口は Chat/Wire HTTP と `org approval approve` のみ。
3. [`src/lib/console-auth/prod-checklist.ts`](../src/lib/console-auth/prod-checklist.ts) で本番 `ORGOS_LLM_TOOLS_WRITE=1` を fail にする。
4. [`src/commands/doctor.ts`](../src/commands/doctor.ts) から `runProdAuthChecks` を呼ぶ（少なくとも当該チェックを含む）。
5. 文書を同期する: `steward/platform/agent/runtime.yaml` · `docs/operator-production.md` · `docs/org-os/operator-layer-spec.md` · `steward/rules/operator-policy.md`。

### Deliverables

- 承認ツール削除と実行時拒否
- 本番フラグ拒否
- テスト反転
- 文書同期

### Acceptance Criteria

- [ ] `ORGOS_LLM_TOOLS_WRITE=1` かつ CEO context でも `listOperatorToolDefinitions` に `operator_approve` が無い
- [ ] `executeOperatorTool("operator_approve", …)` が成功しない
- [ ] `listStewardMcpTools` に `steward_approve` が無い
- [ ] 本番相当 env で `ORGOS_LLM_TOOLS_WRITE=1` の prod-checklist が fail
- [ ] `orgos doctor` が同じ失敗を表面化する
- [ ] 旧テスト「CEO なら operator_approve を含む」が仕様反転されている
- [ ] runtime.yaml / operator-production / operator-layer-spec に承認ツールが「公式機能」として残っていない

### テスト

- 更新: [`tests/operator-runtime-tools.test.ts`](../tests/operator-runtime-tools.test.ts)
- 更新: [`tests/mcp-rbac.test.ts`](../tests/mcp-rbac.test.ts)
- 追加: prod-checklist / doctor の `ORGOS_LLM_TOOLS_WRITE` ケース

### 確認コマンド

```bash
npx vitest run tests/operator-runtime-tools.test.ts tests/mcp-rbac.test.ts
npm run typecheck
```

---

## HA-2 — 承認の本人性と自己承認禁止

**優先度:** P0  
**依存:** HA-1

### 背景

[`approve.ts`](../src/lib/org/approval/approve.ts) は呼出元の `approverId` / `operatorId` 文字列を使う。登録名照合はあるが、認証オペレータと名義の一致は強制されない。自己承認禁止は予算・経費・事業計画・`tenant.config` に限定。

### 実装要件

1. `approveOrgApproval` で `operatorId` 必須。`approverId` は当該 Operator の `approver_name` / `display_name` と一致しなければならない。
2. CLI `--approver` が認証済み本人と不一致なら拒否。
3. Chat/Wire HTTP 承認はセッションの `operator_id` / `approver_id` のみ使う（ボディで別人名義にできない）。
4. `org approval approve` と Chat 汎用 approve に、通信文と同じ ceo/approver ロール要求を適用する（`requireCliHumanApproval` 相当）。
5. `isSelfApprovalBannedSubject` の早期 return をやめ、全 internal subject に自己承認禁止を適用する。例外が必要なら allowlist を明示し ADR に残す。

### Deliverables

- 名義バインド
- ロール強制
- 自己承認の全件適用
- テスト更新

### Acceptance Criteria

- [ ] `operatorId` なしの `approveOrgApproval` は失敗する
- [ ] 認証オペレータと不一致の `approverId` は失敗する
- [ ] role=`operator` は `chat:approve` があっても汎用承認できない
- [ ] 汎用 internal（例: `regulation.amendment`）でも proposer == approver は失敗する
- [ ] Chat approve API がリクエストボディの別人 `approver_id` を無視または拒否する
- [ ] 既存の正当な CEO 承認テストは通る

### テスト

- 更新: [`tests/org-approval.test.ts`](../tests/org-approval.test.ts)
- 追加: 名義不一致 · ロール不足 · 汎用 subject の自己承認

### 確認コマンド

```bash
npx vitest run tests/org-approval.test.ts
npm run typecheck
```

---

## HA-3 — Company Event 変更 CLI の認証

**優先度:** P0  
**依存:** HA-1

### 背景

`events new` / `close` / `archive` / `chain backfill --force` に Operator 認証がない。`backfill --force` はチェーンを空にして再生成する。`skipChain: true` が公開オプション。

### 実装要件

1. [`schemas/org/operator.ts`](../schemas/org/operator.ts) に `events:write` を追加する。ceo / operator に付与、readonly / mcp_service には付けない。
2. `events new` / `close` / `archive` / void 系に `requireCliOperator({ permission: "events:write" })`。
3. `events chain backfill --force` は通常経路で拒否。必要なら `ORGOS_EVENTS_CHAIN_REBUILD=1` かつ ceo + 確認フラグの破壊的コマンドに隔離し、監査イベントを残す。
4. `skipChain` を公開オプションから外す。void 内部実装のみ残す。

### Deliverables

- permission と CLI 認証
- `--force` 隔離
- `skipChain` 非公開化
- テスト

### Acceptance Criteria

- [ ] 未認証の `events new` / `close` / `archive` は失敗する
- [ ] `events:write` なしのロールは失敗する
- [ ] 通常実行で `backfill --force` は既存チェーンを消さない
- [ ] 外部から `skipChain: true` で create してもチェーンが付くか、オプション自体が型から消えている
- [ ] void 内部の `skipChain` は従来どおり動く

### テスト

- 更新: [`tests/company-events-cli.test.ts`](../tests/company-events-cli.test.ts)
- 追加: 無認証拒否 · `--force` 拒否 · skipChain 非公開

### 確認コマンド

```bash
npx vitest run tests/company-events-cli.test.ts tests/company-events.test.ts
npm run typecheck
```

**注意:** HA-4 完了前は mal 実テナントを汚さない。新規テストは一時ディレクトリを使う。

---

## HA-4 — テストを実テナントから隔離する

**優先度:** P0  
**依存:** HA-3

### 背景

company-events 系テストが `setTenantId("mal")` を使う。abnormal は registry だけ復元し chain に orphan を残す。

### 実装要件

1. 次を一時テナント（`os.tmpdir()` 上の空 registry / 空 chain）へ切り替える。
   - [`tests/company-events.test.ts`](../tests/company-events.test.ts)
   - [`tests/company-events-abnormal.test.ts`](../tests/company-events-abnormal.test.ts)
   - [`tests/company-events-chain.test.ts`](../tests/company-events-chain.test.ts)
   - [`tests/company-events-lifecycle.test.ts`](../tests/company-events-lifecycle.test.ts)
   - [`tests/company-events-cli.test.ts`](../tests/company-events-cli.test.ts)
2. `afterEach` で一時ディレクトリを削除する。abnormal は chain も隔離対象にする。
3. 回帰: テスト前後で `tenants/mal` の registry / chain が変わらないことを assert する。

### Deliverables

- 一時テナント fixture ヘルパー
- 5 ファイルの移行
- mal 非汚染の回帰テスト

### Acceptance Criteria

- [ ] 上記 5 ファイルに `setTenantId("mal")` が残っていない（または mal を読取専用 assert 以外に使っていない）
- [ ] スイート実行後に `tenants/mal/data/company-events.yaml` と chain ファイルが変化しない
- [ ] abnormal が chain に orphan を残さない
- [ ] 既存の chain verify / lifecycle アサーションは一時テナント上で通る

### テスト

- 更新: 上記 5 ファイル
- 追加: mal 非汚染ガード

### 確認コマンド

```bash
npx vitest run tests/company-events.test.ts tests/company-events-abnormal.test.ts tests/company-events-chain.test.ts tests/company-events-lifecycle.test.ts tests/company-events-cli.test.ts
git diff --stat -- tenants/mal/data/company-events.yaml tenants/mal/data/.orgos
```

---

## HA-5 — HumanApprovalContext と step-up

**優先度:** P1  
**依存:** HA-2

### 背景

`HumanApprovalContext` は未実装。ADR 0037 の Passkey step-up は tier B/C のみ。Dev MCP は token 無しで ceo 全権限になりうる。

### 実装要件

1. `schemas/org/human-approval-context.ts` を追加する（署名 · nonce · 期限 · 対象 digest = `approval_id` + 本文ハッシュ）。
2. `approveOrgApproval` は有効な HumanApprovalContext を検証する。LLM / MCP は発行できない。
3. 発行口は Chat/Wire UI の明示ボタン、または CLI の人間セッションに限る。
4. ADR 0037 を改訂（または ADR 0038）し、最終承認の人間セレモニーを定義する。少なくともセッション再確認、可能なら settlement Passkey を全最終承認に広げる方針を文書化する。
5. 非本番・token 無し MCP の ceo フォールバックを read/ask のみに落とす。

### Deliverables

- schema + 検証
- approve 経路への組み込み
- ADR
- Dev MCP 緩和閉鎖
- テスト

### Acceptance Criteria

- [ ] context なし / 期限切れ / digest 不一致 / 他人署名の承認は失敗する
- [ ] Chat UI / CLI 人間セッションからは正当な承認が通る
- [ ] MCP token 無しが ceo 権限にならない
- [ ] ADR と operator-policy が「AI は承認を実行しない」と一致する

### テスト

- 新規: `tests/human-approval-context.test.ts`
- 更新: MCP / Chat approve 系

### 確認コマンド

```bash
npx vitest run tests/human-approval-context.test.ts tests/org-approval.test.ts tests/mcp-rbac.test.ts
npm run typecheck
```

---

## HA-6 — チェーン外部固定と Workspace Control

**優先度:** P2  
**依存:** HA-3, HA-5

### 背景

ハッシュチェーンは内部整合のみ検査する。ファイル全体を新 Genesis で置き換える攻撃は防げない。company-events の直編集ガードは無い。`orgos doctor` は prod-checklist 全体を呼ばない。

### 実装要件

1. チェーン末尾 digest を既存 protocol Witness Hub へ定期固定する（週次 attest のローカル Ed25519 に追加）。
2. Git タグまたは別保管の署名済み固定点を残す手順を文書化する。
3. `company-events.yaml` / chain JSONL / イベント MD の直接 write を、`protocol-write-guard` と同型で拒否する。正規経路は `orgos events *` のみ。
4. `orgos doctor` が `runProdAuthChecks` と整合する（HA-1 の続きをここで閉じる）。

### Deliverables

- witness pin CLI / skill
- write guard
- doctor 整合
- 運用文書

### Acceptance Criteria

- [ ] 末尾 digest を Witness に固定できる
- [ ] 固定点と現チェーン末尾が不一致なら verify / monthly audit が fail する
- [ ] ライブラリ外の直接 FS 書き込みヘルパー経由は拒否される（正規 CLI は成功）
- [ ] `orgos doctor` が本番 misconfig（auth off · write tools · empty registry 等）を報告する
- [ ] 運用文書に「`backfill --force` で復旧しない」と明記されている

### テスト

- 新規: witness pin · write guard
- 更新: doctor / monthly audit

### 確認コマンド

```bash
npx vitest run tests/company-events-chain.test.ts
npm run typecheck
npm run orgos -- doctor
```

---

## 進め方

1. チケットを 1 件 open にする（本ファイルの状態列）。
2. 実装前に対象ファイルと受け入れを読み直す。
3. 失敗するテストを先に書く（または既存テストを仕様反転する）。
4. 実装し、受け入れチェックリストを埋める。
5. 文書の旧仕様（「CEO なら approve ツール」等）が残っていないか grep する。
6. Work Order を complete し、次チケットへ。
