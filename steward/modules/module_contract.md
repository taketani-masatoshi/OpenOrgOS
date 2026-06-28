# 業務モジュール契約（Module Contract）

> 業務モジュールを追加・改修する際に**満たすべき契約**。検証: `npm run orgos -- modules check <id>` / `modules check --all`。
> 一覧・トークン方針: [00-このフォルダについて.md](00-このフォルダについて.md) · readiness 正本: [readiness.yaml](readiness.yaml)

Steward OS の業務モジュールは「フレームワーク側の再利用可能な部品」である。テナントは `modules.yaml` で **ON/OFF とパスバインドのみ** を行い、モジュール本体は法人非依存に保つ。

---

## 1. ディレクトリ構成（必須）

```
steward/modules/{id}/
├── module.manifest.yaml   契約メタ（必須）
├── agent.md               Agent 定義（必須 · 汎用 · 法人名は架空サンプルのみ）
├── skills/                モジュール Skill（任意 · registry.yaml 推奨）
│   ├── registry.yaml
│   └── {skill-id}.md
├── cli/                   モジュール CLI（任意）
│   ├── lib.ts             ドメインロジック
│   ├── commands.ts        コマンド handler（任意）
│   └── register.ts        ModuleCliBundle — src/lib/module-cli.ts へ登録
└── seed/                  雛形データ（YAML/CSV/MD · *.example）
```

- `agent.md` に**実在の法人名・物件名・口座等（L1/L2）を書かない**。例示は「サンプル商事」等の架空値。
- `seed/` はテナント `data/` · `docs/` に展開する雛形。Git 追跡は `*.example` のみが原則。

## 2. manifest スキーマ（`module.manifest.yaml`）

正本実装: `moduleManifestSchema`（`src/lib/modules.ts`）

| フィールド | 型 | 必須 | 意味 |
|-----------|----|:---:|------|
| `id` | string | ○ | カタログ id（ディレクトリ名と一致） |
| `required_seeds` | string[] | （既定 `[]`） | production_ready に必須の seed。`invoice-*` を含むと billing 連携が必須 |
| `activation_seeds` | string[] | （既定 `[]`） | activation_ready で必要な seed 一式 |
| `optional_regulations` | string[] | 任意 | 関連する REG カタログ id |
| `notes` | string | 任意 | tier 根拠等のメモ |

## 3. readiness tier 別の要件

正本: [readiness.yaml](readiness.yaml)（`src/lib/module-readiness.ts`）

| tier | 追加要件 |
|------|---------|
| **skeleton** | manifest · agent.md · seed/ が存在 |
| **activation_ready** | 上記 + `activation_seeds` の各ファイルが `seed/` に実在 |
| **production_ready** | 上記 + `required_seeds` の各ファイルが実在。`invoice-*` seed があれば billing 連携（テナント `modules.yaml` の `billing`）が必要 |

`modules check` は manifest 欠落・seed 欠落・tenant bind 不整合を検出する。`modules check --all` は加えて `src/lib/extensibility-contract.ts`（pack-ids · CLI 登録 · capability catalog · readiness 同期 · protocol registry）を検証する。

## 4. classification / routing への接続

- 業務モジュール agent は classification 上、`MODULE_TO_CLASSIFICATION_AGENT`（`src/lib/modules.ts`）でコア 8 agent のいずれかに **proxy マップ** される（用語は [steward/rules/00-このフォルダについて.md](../rules/00-このフォルダについて.md) の glossary 参照）。
- 新規 agent id を増やす場合は `schemas/modules.ts` の `moduleAgentId` に追加し、必要なら proxy マップを更新する。

## 5. 新モジュール追加手順

1. `steward/modules/{id}/module.manifest.yaml` を作成（`id` 必須）
2. `steward/modules/{id}/agent.md` を作成（[professional_services/](professional_services/) を雛形）
3. 必要に応じ `{id}/skills/` · `{id}/seed/`（`*.example`）を追加
4. `schemas/modules.ts` の `moduleAgentId` に id を追加（必要なら proxy マップ）
5. `readiness.yaml` に tier を登録
6. `npm run orgos -- modules check {id}` で契約検証 → `npm run check`
7. テナントで使う場合のみ `tenants/{id}/modules.yaml` にエントリ追加（パスバインドのみ）
8. CLI がある場合 `{id}/cli/register.ts` で `ModuleCliBundle` を export し `src/lib/module-cli.ts` の `MODULE_CLI_BUNDLES` に追加
