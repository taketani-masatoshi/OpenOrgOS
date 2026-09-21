# ADR 0079 — モジュールの AI 権限は manifest で宣言し、registrar で強制する

- **Status:** Accepted
- **Date:** 2026-09-21
- **Deciders:** OrgOS maintainers

## Context

「AI は提案まで。確定は人間」は `steward/rules/` と各 `agent.md` の散文にしかない。差分としてレビューできず、テストでも固定できない。

型はすでにある。`schemas/module-security-manifest.ts` の `moduleAiPermissionsSchema` は `can_observe` `can_analyze` `can_draft` `can_propose` `can_approve` `can_execute` を持つ。

2026-09-21 時点の実測（`steward/modules/*` 25 件 ＋ `steward/jurisdiction-packs/JP/modules/*` 21 件 = manifest 46 件）:

| 宣言 | 件数 |
|------|------|
| `security:` あり | 27 / 46 |
| `security.limits.concurrent_jobs` | 27 / 46 |
| `security.permissions.*`（`data_read` `data_propose` `data_execute` `network_egress` `agent_relay` `secrets_use`） | 0 / 46 |
| `security.ai.*` | 0 / 46 |

`security:` を持つ 27 件は中身が `limits.concurrent_jobs` だけで、権限宣言としては一度も使われていない。残り 19 件は `security:` 自体がない。

権限をフォルダ構成から推定することはできない。module `cli/` 内の書込は `hospitality` 17 箇所・`jp_permit_application` 10 箇所などに偏り、`sales`（`cli_commands` 18 本）は 0 である。書込の実体は `src/lib/` と `src/commands/` にある。

一方で mutation ゲートは分散していない。`--operator-id` は `src/cli/registrars/` の 3 ファイル・26 行（`domain.ts` 12 · `orchestration.ts` 9 · `platform.ts` 5）に集中している。

## Decision

1. **全モジュールの manifest は `security.ai` を明示する。** 既定値への暗黙依存をやめる。未宣言は「安全」ではなく「未記入」として扱う。
2. **既定の姿勢は `can_propose: false` · `can_approve: false` · `can_execute: false`。** `can_observe` `can_analyze` `can_draft` は true でよい。
3. **`can_approve` はどのモジュールも true にしない。** 承認は人間の行為であり、モジュールの能力ではない。
4. **`can_execute: true` は broker 経由の事前委任枠だけに開く。** カタログ内部モジュールの既定は false、第三者モジュールは hard deny を維持する。
5. **強制点は registrar と capability 解決に置く。** `grantedCapabilitiesFromSecurity`（`src/lib/module-capability.ts`）と `src/cli/registrars/` の mutation ゲートで、宣言と実際の書込経路の整合を検証する。46 モジュールのコードには触らない。
6. **`security:` が無い 19 件には `limits.concurrent_jobs` を補う。** 既存 27 件の慣例（core 2 · JP pack 1）を踏襲する。根拠は [0040](0040-aia-parallel-runtime.md)。
7. **新規モジュールは宣言込みで生まれる。** `orgos platform scaffold --kind module` の雛形に `security.ai` を含め、`orgos modules check` は既存の未宣言を warning、新規モジュールの未宣言を失敗として扱う。

各 `agent.md` に足すのは 1 行（権限の位置と本 ADR への参照）だけとする。同じ散文を 100 ファイルに複製しない。

### `can_propose` の初期値をどう決めたか

推測を避けるため、観測可能な根拠があるものだけを true にした。

| 根拠 | 該当 |
|------|------|
| 提案物を生成する CLI コマンド名（`draft` `propose` `prepare` `suggest` `quote` `pack` `export-pdf` `xml-draft` `doc-propose-approval`） | 12 件 |
| module `cli/` に書込がある | 8 件 |
| module `cli/` が `--operator-id` を要求する | 2 件 |

和集合は 16 件（`hospitality` `language_bridge` `sales` `travel_booking` `venue_booking` `jp_bank_corporate` `jp_consumption_refund` `jp_corporate_registration` `jp_jsox` `jp_medical_device` `jp_payroll` `jp_permit_application` `jp_permit_registry` `jp_subsidy_application` `jp_tax_corporate` `jp_trademark_application`）。残り 30 件は false。個別に見直す場合は 1 行の差分で足りる。

## Consequences

- 「提案まで」がレビュー可能な差分になり、拒否テストで固定できる。
- 既存の 27 件は `concurrent_jobs` の意味が変わらないまま、`ai` が追加される。後方互換。
- 宣言は manifest、強制は registrar、という分担が固定される。モジュール追加のたびにゲートを書き直さない。
- 実行を持つ経路が `can_execute: true` の一覧として数えられる。現時点では 0 件。

Out of scope: Wire Gateway の権限（Gateway に業務判断を載せない方針は変更しない）· 第三者モジュールの runtime 隔離 · e-Tax 等の外部送信。

## Related

- [0040](0040-aia-parallel-runtime.md) — AIA 並列ランタイム（`concurrent_jobs` の由来）
- [0080](0080-catalog-id-materialism.md) — カタログ id は実体のあるものだけ置く
- `steward/rules/ai-permission-declaration.md` — 運用正本
- `steward/rules/agent-authority-model.md` — 組織線と作業中継の分離
