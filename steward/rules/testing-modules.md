# OrgOS 論理テストモジュール分割（正本）

**版:** 1.0 · **日付:** 2026-07-10  
**機械可読:** [`tests/test-registry.yaml`](../tests/test-registry.yaml) · [`tests/test-registry.ts`](../tests/test-registry.ts)

Vitest テストを **3 軸**（Catalog · Platform · Integration）で分類し、段階実行で安定稼働を確認するための taxonomy 正本。

---

## 1. 数値正本（2026-07-10 実測）

| 指標 | 値 |
|------|-----|
| Vitest テストファイル | **225**（`tests/**/*.test.ts` · registry 含む） |
| 業務 catalog module | **29**（core 21 + JP pack 8） |
| production_ready | **28** |
| skeleton | **1**（`jp_permit_registry`） |
| CLI 登録（`MODULE_CLI_BUNDLES`） | **18** |
| CLI なし | **11** |
| catalog coverage gap | **9**（専用 cli/lib テストなし） |

---

## 2. 3 軸 taxonomy

| 軸 | 意味 | 実行 npm script |
|----|------|-----------------|
| **Contract / Meta** | extensibility · modules · readiness · os100 等 | `npm run test:contract` |
| **Platform** | `src/lib/` 6 ドメイン | `npm run test:platform` |
| **Catalog** | 業務 module catalog id（29） | `npm run test:catalog` |
| **Integration** | CLI subprocess · protocol E2E · mal 共有 queue | `npm run test:integration` |
| **Full gate** | 全 225 件 | `npm test`（CI 正本） |
| **Tiered** | 上記を依存順 | `npm run test:tiered` |

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
| full | 1 | 専用テスト 2 ファイル以上（`jp_permit_registry`） |
| dedicated | 6 | 単一 module 向け `jp-*` / travel / language_bridge |
| bundled | 10 | `wave-modules-cli.test.ts` に束ね |
| partial | 4 | invoice/skeleton/CLI のみ（rental, restaurant, hospitality, venture_capital） |
| gap | 9 | contract テストのみ — 新規 `tests/catalog/` 追加候補 |

**Catalog モジュールテスト合格基準:**

- `steward/modules/{id}/cli/lib.ts` または seed schema を直接 import
- `setTenantId` で tenant を 1 つ明示
- HTTP / CLI subprocess 不要（必要なら integration へ）
- 追加後: `npm run test:registry:sync`

雛形: [`tests/catalog/_template.example.ts`](../tests/catalog/_template.example.ts)

---

## 5. Integration tier

| ID | 内容 | 例 |
|----|------|-----|
| I1 | CLI subprocess | skeleton · demo-validate |
| I2 | Protocol E2E | protocol-witness-integration · wire-relay-e2e |
| I3 | Workflow 横断 | escalate · phase2 · routing |
| I4 | デモ/証跡 | mal-wire-* · standalone-org-demo |

---

## 6. CI subset（registry 正本）

| suite | 件数 | 定義 |
|-------|------|------|
| security-rbac | 10 | `.github/workflows/validate.yml` |
| wire-gateway-smoke | 26 | validate.yml + governance 2 件 |
| steward-chat-smoke | 28 | `package.json` |
| wire-console-test | 5 | `package.json` |

整合テスト: [`tests/testing-registry.test.ts`](../tests/testing-registry.test.ts)

---

## 7. 実行制約

- [`vitest.config.ts`](../vitest.config.ts): `fileParallelism: false`（mal routing-queue 等）
- [`tests/setup-restore-protocol.ts`](../tests/setup-restore-protocol.ts): 毎 `beforeEach` で protocol fixture 復元
- 同一 workspace 上での shard 並列は **非推奨**（fixture race）

---

## 8. 新規テスト追加手順

1. `tests/{name}.test.ts` を追加
2. `npm run test:registry:sync` で YAML 再生成
3. `npm run test:registry:check`（testing-registry.test.ts）が通ることを確認
4. catalog module 向けなら `catalog_modules.{id}.coverage_tier` を [`test-registry.ts`](../tests/test-registry.ts) の `buildDefaultCatalogModules()` で更新

---

## 9. 関連

- [module_contract.md](../modules/module_contract.md) — 業務 module 契約
- [readiness.yaml](../modules/readiness.yaml) — tier 正本
- [tool-neutral-development.md](tool-neutral-development.md) — テスト優先開発
