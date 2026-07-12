# OrgOS 論理テストモジュール分割（正本）

**版:** 1.2 · **日付:** 2026-07-11
**機械可読:** [`tests/test-registry.yaml`](../tests/test-registry.yaml) · [`tests/test-registry.ts`](../tests/test-registry.ts)

Vitest テストを **3 軸**（Catalog · Platform · Integration）で分類し、段階実行で安定稼働を確認するための taxonomy 正本。

---

## 1. 数値正本（registry 同期 · `npm run test:registry:sync`）

| 指標 | 値 |
|------|-----|
| Vitest テストファイル | **318**（`tests/**/*.test.ts` · registry 含む） |
| テストケース（静的 `it`/`test` **1196**） | registry の決定論カウント。動的生成を含む実行件数は `npm test` 結果を参照 |
| 業務 catalog module | **30**（core 21 + JP pack 9） |
| production_ready | **28** |
| skeleton | **1**（`jp_permit_registry`） |
| CLI 登録（`MODULE_CLI_BUNDLES`） | **19** |
| catalog coverage gap | **0** |
| catalog dedicated (+ full) | **12** |
| catalog bundled | **9** |
| catalog_only | **9** |

整合テスト: [`tests/testing-registry.test.ts`](../tests/testing-registry.test.ts) · [`tests/testing-modules-doc-sync.test.ts`](../tests/testing-modules-doc-sync.test.ts)

---

## 2. 3 軸 taxonomy

| 軸 | 意味 | 実行 npm script |
|----|------|-----------------|
| **Contract / Meta** | extensibility · modules · readiness · os100 等 | `npm run test:contract` |
| **Platform** | `src/lib/` 6 ドメイン | `npm run test:platform` |
| **Catalog** | 業務 module catalog id（30） | `npm run test:catalog` |
| **Integration** | CLI subprocess · protocol E2E · mal 共有 queue | `npm run test:integration` |
| **Full gate** | 全件 | `npm test`（CI 正本） |
| **Tiered** | 上記を依存順 | `npm run test:tiered` |
| **Verify only** | 分類整合（Vitest なし） | `npm run test:tiered:verify` |

---

## 3. Platform 6 domain

| ID | 名称 | layer | 主な src/lib |
|----|------|-------|-------------|
| P01 | `kernel` | 1 | schemas · tenant · classification · jurisdiction |
| P02 | `business_data` | 2 | data.ts · company-events · invoice · tenant |
| P03 | `correspondence_org` | 2 | correspondence/ · org/ · secretary/ |
| P04 | `wire_stack` | 3 | protocol/ · wire/ · hub/ · wire-gateway/ |
| P05 | `console_layer` | 4 | steward-chat/ · wire-console/ · mcp/ · console-auth/ |
| P06 | `agent_workflow` | 4 | operator-runtime/ · escalate · routing · phase* |

```bash
npm run test:platform -- P04_wire_stack
```

---

## 4. Catalog module — coverage_tier

| tier | 件数 | 説明 |
|------|------|------|
| full | 2 | 専用テスト 2 ファイル以上（`jp_permit_registry` · `jp_bank_corporate`） |
| dedicated | 10 | 単一 module 向けテスト（`jp-*` · travel · rental · hospitality 等） |
| bundled | 9 | `wave-modules-cli.test.ts` + `catalog/bundled-modules-contract.test.ts` |
| catalog_only | 9 | CLI なし module — `tests/catalog/{id}.test.ts` 各 1 ファイル |
| gap | 0 | 未カバー — **禁止**（registry check で検出） |

**Catalog モジュールテスト合格基準:**

- `steward/modules/{id}/cli/lib.ts` または seed schema を直接 import
- `setTenantId` で tenant を 1 つ明示
- catalog_only: `catalog-module-harness` — manifest · `invoiceTemplateSchema` · activation seed Zod · readiness
- HTTP / CLI subprocess 不要（必要なら integration へ）
- 追加後: `npm run test:registry:sync` → `npm run test:registry:check`

`catalog_modules` の `coverage_tier` · `cli` · `tests[]` は **手書き禁止** — `readiness.yaml` + **`buildCatalogFileMap()`**（テストファイル内容から自動導出）+ `MODULE_CLI_BUNDLES` から導出。

新規 catalog_only 追加: `npm run test:registry:scaffold -- <catalog_id>` → sync → check。

雛形: [`tests/catalog/_template.example.ts`](../tests/catalog/_template.example.ts) · 共有 harness: [`tests/catalog/catalog-module-harness.ts`](../tests/catalog/catalog-module-harness.ts)

---

## 5. Integration tier

| ID | 内容 | 例 |
|----|------|-----|
| I1 | CLI subprocess | skeleton · demo-validate |
| I2 | Protocol E2E | protocol-witness-integration · wire-relay-e2e |
| I3 | Workflow 横断 | escalate · phase2 · routing |
| I4 | デモ/証跡 | mal-wire-* · standalone-org-demo |

---

## 6. CI gate（registry 正本）

| ステップ | Job | 内容 |
|---------|-----|------|
| registry sync diff | `validate` | YAML commit 漏れ検出 |
| registry check | `validate` | 双方向整合 · catalog · platform · CI suites |
| tiered verify | `validate` | `npm run test:tiered:verify` |
| full vitest | `validate` | `npm test` |

`npm run test:tiered` はローカル診断用。CI は partition の完全性を `test:tiered:verify` で検証後、
同じ全ファイルを一度だけ `npm test` で実行する（二重全件実行を避ける）。

**CI subset suites:**

| suite | 件数 | 定義 |
|-------|------|------|
| security-rbac | 10 | `.github/workflows/validate.yml` |
| wire-gateway-smoke | 26 | validate.yml + governance 2 件 |
| steward-chat-smoke | 28 | `package.json` |
| wire-console-test | 5 | `package.json` |
| scheduling-smoke | 11 | `package.json` · `npm run test:scheduling` |

---

## 7. 実行制約

- [`vitest.config.ts`](../vitest.config.ts): `fileParallelism: false`（mal routing-queue 等）· `hookTimeout: 40_000` · `testTimeout: 60_000`（mail-heavy）
- 日程調整回帰: `npm run test:scheduling`（scheduling-*.test · doctor-repair · operator-registry-cli）
- [`tests/setup-restore-protocol.ts`](../tests/setup-restore-protocol.ts): 毎 `beforeEach` で protocol fixture 復元（ロック待ち最大 60s）
- 同一 workspace 上での shard 並列は **非推奨**（fixture race）
- stale lock: `orgos doctor --repair`（または `rm -rf tests/.fixture-restore.lock`）
- テナント runtime 生成物: [tenant-runtime-artifacts.md](../../docs/org-os/tenant-runtime-artifacts.md)

### 7.2 全件 `npm test`（305 files · 直列 · 10 分超のことあり）

```bash
orgos doctor --repair    # stale fixture lock を除去
npm test                 # CI validate job と同じ
```

PR 前は `npm run test:contract`（約 1 分）を優先。main push / release 前に全件 green を確認。

### 7.1 Agent / Skill 変更後（推奨）

```bash
npm run test:contract          # 102 契約テスト（PR 前の高速 gate）
npm run agent:pipeline:check   # catalog · docs · roster · skill dispatch
npm run generated:check        # policy ミラー · generated artifacts
```

`npm run check` に `agent:pipeline:check` を含む — CI `validate` job でも実行されます。

---

## 8. 新規テスト追加手順

1. `tests/{name}.test.ts` を追加
2. `npm run test:registry:sync` で YAML 再生成
3. `npm run test:registry:check` · `npm run test:tiered:verify` が通ることを確認
4. catalog module 向けなら `buildDefaultCatalogModules()` の `coverage_tier` / `tests` を更新

---

## 9. mal Wire pilot と Vitest

`tenants/mal` の protocol pilot データ（`peers.yaml` · `transactions-registry.yaml`）と L2 `records/executive/mail-config.yaml` は **`tests/setup-restore-protocol.ts` が preserve** する。

mal pilot 作業中に Cursor / IDE の Vitest 常駐が mal データを上書きする場合:

```bash
pkill -9 -f vitest   # 作業前に停止
```

---

## 10. 関連

- [tenant-runtime-artifacts.md](../../docs/org-os/tenant-runtime-artifacts.md) — gitignore 対象のテナント生成物
- [module_contract.md](../modules/module_contract.md) — 業務 module 契約
- [readiness.yaml](../modules/readiness.yaml) — tier 正本
- [tool-neutral-development.md](tool-neutral-development.md) — テスト優先開発
