# OrgOS — Specification（正本）

> **本ドキュメントが唯一の仕様正本。** v0.2–v0.8 の各版は [spec/history/](spec/history/) に履歴として保存。
> 機能差分（Phase 別）は本書末尾の [変更履歴](#15-変更履歴phase-changelog) を参照。
> **製品名:** OrgOS（参照実装 npm: `orgos-reference` · CLI: `orgos`）— 旧称 Steward OS は [org-os/orgos-vocabulary.md](org-os/orgos-vocabulary.md) · [cli-migration.md](org-os/cli-migration.md)
> 物理レイアウト正本: [steward/rules/repository_layout.md](../steward/rules/repository_layout.md) · アクセス正本: [steward/rules/folder_access_policy.md](../steward/rules/folder_access_policy.md)

**版:** 統合（〜v0.8 / Phase 3）· **対象:** OrgOS 参照実装（会社データはテナント分離）

---

## 1. 目的

OrgOS は **テナント分離型の組織 OS 参照実装**（DMS ではない）。不動産賃貸・宿泊・受託等の業務モジュールを ON/OFF し、会社データを YAML 正本で蓄積し、CLI · Agent · Skill で運用する。

- **フレームワーク**（`src/` · `schemas/` · `steward/` · `docs/`）は法人非依存
- **テナント**（`tenants/{id}/`）が法人データ · 規程 · パスをバインド
- 最終判断は **人間（オーナー）** が行う。Agent は提案・下書きのみ

---

## 2. 4 層 + テナント

```
Steward（経営統括）  ↑ Agent 要約のみ読む
Agent（部門統括）    ↑ Skill を呼ぶ
Skill（定型業務）    ↑ 限定入出力
Data / File（事実）
```

思想正本: [steward/rules/steward_os_principles.md](../steward/rules/steward_os_principles.md)

```
フレームワーク（汎用）
├── steward/modules/{id}/       業務モジュール Agent · skills · seed/
├── steward/standards/iso/      ISO 標準方針 · 記録様式
├── steward/standards/regulations/  社内規程 catalog · テンプレ
├── steward/core/agents/             6 コア Agent
├── steward/core/routing/            Agent ルーティング registry（Phase 1）
├── steward/core/orchestrators/      consult/implement オーケストレーション
├── steward/platform/webhook/ · steward/platform/agent/  inbound webhook · cloud runtime（Phase 3）
├── src/ · schemas/ · docs/

テナント（接続）
├── tenant.yaml                 法人メタ · lifecycle
├── modules.yaml                業務モジュール ON/OFF · billing · パス
├── standards.yaml              ISO 有効化
├── regulations.yaml            社内規程有効化
├── data/                       正データ YAML
├── docs/                       人向け書類 · 監査記録
└── rules/                      company_context · active_context
```

| 論理パス | 解決先 |
|---------|--------|
| `data/...` | `tenants/{active}/data/...` |
| `docs/...` | `tenants/{active}/docs/...` |

```bash
export ORGOS_TENANT=mal          # または --tenant mal
npm run orgos -- validate
```

---

## 3. テナント設定ファイル

| ファイル | 役割 |
|---------|------|
| `tenant.yaml` | id · 法人名 · default フラグ · `lifecycle: skeleton \| operational \| test`（`test` = 自動テスト専用 · Console タブ非表示） |
| `modules.yaml` | 有効モジュール · `property_ids` · `docs_root` · `operations_*` · `billing` |
| `standards.yaml` | 有効 ISO 標準（`steward/standards/iso/` 参照） |
| `regulations.yaml` | 有効社内規程（catalog id → テナント施行 MD） |
| `data/ops-config.yaml` | P0 判定 · 会計年度 · records プローブ · 監査パス · `skeleton: true` で P0 ブロッカー抑制 |
| `data/classification-registry.yaml` | L0–L3 データ分類 · git/ai 境界正本 |

**骨格生成:**

```bash
npm run orgos -- tenant init acme --name "株式会社ACME" --from rental
npm run orgos -- regulations seed          # effective REG の template → docs/company/regulations/
npm run orgos -- --tenant acme validate
```

`regulations.yaml` で `enabled: true` かつ bind 充足（effective）の規程は、テナント側 `docs/company/regulations/{tenant_doc}` が必須。骨格では `regulations seed` で `[TBD]` プレースホルダ付き MD を生成する。

**Agent トークン節約:** `enabled: false` のモジュールの `agent.md` / `seed/` は読まない。有効範囲は `rules/active_context.md` に同期（`steward modules sync-context`）。

### 参照テナント

| テナント | 用途 | CI (`npm run check`) |
|---------|------|:--------------------:|
| `mal`（既定） | 本番運用参照（株式会社MAL） | `npm run validate`（default） |
| `acme` | 第3転用性実証 · `tenant init` 生成物参照 | validate ゲート |
| `demo` | 最小骨格 · MAL パス非依存 · 架空名 | validate ゲート |
| `_template` | init ソース · example のみ Git 追跡 | — |

詳細: [tenants/00-README.md](../tenants/00-README.md)

---

## 4. 業務モジュール tier（3 段階）

正本: [steward/modules/readiness.yaml](../steward/modules/readiness.yaml) · ロジック: `src/lib/module-readiness.ts`

| tier | 意味 |
|------|------|
| **production_ready** | カタログ Agent · seed · CLI / billing 連携が本番運用可能（rental · hospitality · professional_services · saas_subscription · restaurant） |
| **activation_ready** | activation seed 一式あり。テナント有効化前に seed 展開 + validate（14 モジュール · 含 **software_outsourcing · event_operations · real_estate_brokerage · property_management**） |
| **skeleton** | カタログ · 最小 example のみ。有効化前に seed 展開が必要 |

```bash
npm run orgos -- modules list          # Tier 列を表示
npm run orgos -- modules check --all    # catalog 全件（tier aware）
npm run orgos -- modules check rental
```

モジュール契約（manifest スキーマ · tier 要件 · 追加手順）: [steward/modules/module_contract.md](../steward/modules/module_contract.md) · 一覧: [steward/modules/00-このフォルダについて.md](../steward/modules/00-このフォルダについて.md)

---

## 5. 成熟度（三次元）

`steward status` · `steward status --os-99`（会社 OS 総合 · §10） · `steward pipeline run daily` · テナント assessment で共通利用。定義正本: [framework-assessment.md](framework-assessment.md#4-テナント成熟度三次元)。

| 次元 | id | 主な入力 |
|------|-----|---------|
| **準備度** | preparedness | `validate` · 規程カタログ · 予実計画 · 契約台帳 |
| **運用度** | operational | P0（`ops-config.yaml`）· 月次 finance · operations secrets/records |
| **自動化度** | automation | classification · document-io · integrity · daily/deps |

```bash
npm run orgos -- status
npm run orgos -- status --legacy    # 旧データ成熟度メトリクス併記
```

`skeleton` テナントでは運用度 = N/A（P0 ブロッカー抑制）。テナント固有スコアは各テナント `docs/compliance/iso/steward-assessment.md`（法人名・件数はフレームワーク文書に書かない）。

---

## 6. データ分類（L0–L3）と 3 境界

正本: テナント `data/classification-registry.yaml` · [folder_access_policy.md](../steward/rules/folder_access_policy.md) §1.3 · [.cursor/rules/data-classification.mdc](../.cursor/rules/data-classification.mdc)

| 境界 | 制御ファイル | 目的 |
|------|------------|------|
| **Git** | `.gitignore` | L2 を GitHub に出さない |
| **AI 自動** | `.cursorignore` · `.cursorindexingignore` | 個情 vault を勝手に載せない |
| **AI 出力** | L3 ルール · `sanitize-output.ts` | チャット・tracked MD に L2 値を書かない |

| レベル | 例 | Git | AI |
|-----|-----|-----|-----|
| L0 | 会社概要・公開 URL | ○ | 自動可 |
| L1 | 契約概要・残高・業務メール | ○ | 自動可 |
| L2 | 口座番号・Wi-Fi・records 個情 | × | `@file` / 担当 Agent |
| L3 | L2 の転記・要約混入 | × | **禁止** |

- `**/records/**` · `*-secrets.yaml` · `bank-accounts.yaml` · `executive/*.yaml` は Git 非追跡（`*.example` のみ追跡）
- `classification-registry.yaml` の `git: ignore` と `.gitignore` の整合は `steward classification check` が検証（未登録は **error → CI fail**）

```bash
npm run orgos -- classification check
npm run orgos -- classification access --agent finance --path data/finance/bank-accounts.yaml --operation read
npm run orgos -- classification boundaries --check   # registry 駆動で .cursorignore/.cursorindexingignore のドリフト検出
```

- `**/records/**`（L2 個情 vault）は `.cursorignore`（AI 自動）と `.cursorindexingignore`（索引）の双方で除外。境界パターンは registry の `ai_context: blocked` / `cursorignore` リソースから導出（`classification boundaries`）
- tracked ファイル書込は `writeTrackedFile`（`src/lib/utils.ts`）に集約し L2 出力をサニタイズ。`assertSafeTrackedPath`（`src/lib/classification.ts`）が `git: ignore` パスへの追跡書込を拒否

---

## 7. Agent ルーティング・委譲・オーケストレーション

registry: [steward/core/routing/registry.yaml](../steward/core/routing/registry.yaml) · 解説: [steward/core/routing/README.md](../steward/core/routing/README.md)

```bash
npm run orgos -- route list
npm run orgos -- route match --text "契約更新の相談"       # keyword/path → agent
npm run orgos -- route handoff --to finance --subject "..."  # handoff 生成
npm run orgos -- route dispatch --to finance --subject "..."

# 秘書エスカレーション / 実装委譲（Work Order）
npm run orgos -- escalate plan --subject "..." --requirements "..."
npm run orgos -- escalate run --id IMP-...
npm run orgos -- escalate status --id IMP-...
npm run orgos -- escalate complete --id IMP-...
npm run orgos -- escalate merge --id IMP-...        # 全子 WO 完了で自動統合
```

- consult 系: [secretary_escalation.md](../steward/core/orchestrators/secretary_escalation.md)
- implement 系（`task_type: implement` · IMP-*）: [delegate_implementation.md](../steward/core/orchestrators/delegate_implementation.md)

---

## 8. Agent 並列ディスパッチ・キュー・Webhook・Cloud（Phase 2–3）

```bash
# 並列ディスパッチ（manifest / Cursor SDK local|cloud）
npm run orgos -- agent dispatch plan --id IMP-... [--runtime local|cloud|manifest]
npm run orgos -- agent dispatch run  --id IMP-... [--dry-run] [--runtime cloud]

# Cloud Agent 常駐 watch
npm run orgos -- agent cloud config
npm run orgos -- agent cloud watch [--once] [--interval 30000]

# Queue（JSONL: routing-queue/queue/events.jsonl）
npm run orgos -- queue push --event ... --ref ...
npm run orgos -- queue list
npm run orgos -- queue drain

# Webhook（registry: steward/platform/webhook/registry.yaml）
npm run orgos -- webhook config
npm run orgos -- webhook send   --event ... --ref ...
npm run orgos -- webhook ingest --file payload.json
npm run orgos -- webhook serve  [--once] [--host ...] [--port ...]   # inbound HTTP

# Work order → PR
npm run orgos -- merge pr plan   --id IMP-...
npm run orgos -- merge pr create --id IMP-... [--dry-run]
```

| runtime | 動作 |
|---------|------|
| `local` | Cursor SDK · ローカル cwd |
| `cloud` | Cursor SDK · `cloud.repository` + `CURSOR_API_KEY` |
| `manifest` | プロンプト MD のみ（SDK 未導入時フォールバック） |
| `auto`（既定） | `steward/platform/agent/cloud.yaml` + 環境変数から解決 |

Cursor SDK は任意（`npm install @cursor/sdk` + `CURSOR_API_KEY`）。未導入時は manifest モード。
`merge pr create` の実 git/gh 実行はテスト・CI では行わない（dry-run / plan のみ）。

---

## 9. Skills CLI

Cursor 外で Skill 相当のチェックを実行。定義: [steward/core/skills/](../steward/core/skills/00-このフォルダについて.md) · registry: [steward/core/skills/registry.yaml](../steward/core/skills/registry.yaml) · 実装: `src/commands/skills.ts`

```bash
npm run orgos -- skills list
npm run orgos -- skills run daily
npm run orgos -- skills run <id>
```

| command | Skill id | 担当 Agent |
|---------|----------|------------|
| `contract-expiry` | contract_expiry_check | Contract |
| `permit-expiry` | permit_expiry_check | Compliance |
| `monthly-close` | monthly_close | Finance |
| `variance` | variance_analysis | Finance |
| `records-check` | operations_records | Operations |
| `p0` | p0_closing | Executive |
| `daily` | daily_ops | Executive |

`registry.yaml` の `runtime: cli | agent | cursor-only` で実行面を区別（`cursor-only` は `agent` の legacy alias）。

---

## 10. 運用 CLI（P0 · 請求 · 予実 · パイプライン）

```bash
npm run orgos -- ops p0                 # ops-config 駆動 P0 サマリ
npm run orgos -- ops daily              # 成熟度 + P0 + 契約アラート

npm run orgos -- pipeline run daily     # validate → ops daily → dashboard
npm run orgos -- pipeline run weekly    # daily + compliance gap + audit 要約
```

| npm script | 内容 |
|------------|------|
| `npm run daily` | `npm run check` + `pipeline run daily` |
| `npm run weekly` | `npm run check` + `pipeline run weekly` |

```bash
npm run orgos -- invoice generate \
  --module rental --property PROP-001 \
  --from 2026-02 --to 2027-01 --fy FY2026 [--dry-run]
```

- P0 / 会計年度: [tenants/_template/data/ops-config.yaml.example](../tenants/_template/data/ops-config.yaml.example)
- 予実 v2: [spec/yojitsu-v2.md](spec/yojitsu-v2.md) · 請求: [spec/invoice.md](spec/invoice.md) · [spec/hospitality-invoice.md](spec/hospitality-invoice.md)

---

## 11. 監査・コンプライアンス

```bash
npm run orgos -- audit log append --event handoff --ref IMP-... --detail "..."
npm run orgos -- audit log list
npm run orgos -- compliance gap [--tenant mal]   # ISO / REG ギャップ + 統制ギャップ
npm run orgos -- controls list [--iso ISO-9001] [--agent compliance]
npm run orgos -- governance principles status
npm run orgos -- governance principles init
npm run orgos -- governance principles declare --signatory "Name"
npm run orgos -- controls status
npm run orgos -- controls gap
npm run orgos -- controls for-agent compliance
npm run orgos -- controls init
npm run orgos -- controls set --id CTL-9001-4.3 --maturity L2
npm run orgos -- agent readiness [--agent finance] [--min 80]
npm run orgos -- agent pulse --agent finance
npm run orgos -- agent pulse --all
npm run orgos -- agent pulse --extensions
npm run orgos -- operations medical-device show
npm run orgos -- operations medical-device qms draft --doc QMS-MAN-001 --write
npm run orgos -- operations medical-device gvp draft --doc GVP-001 --write
```

正本: `steward/core/agents/agent-capability-manifest.yaml` · 7 軸（定義 / Skill·CLI / データ SoT / routing / dashboard 要約 / test / テナント seed）で 80% を実務利用下限とする。

監査証跡は append-only JSONL（`docs/reports/audit-log/audit.jsonl` · gitignore）。

---

## 12. データ構造（テナント `data/`）

| 領域 | パス | スキーマ |
|------|------|---------|
| Company | `data/company.yaml` | company |
| Property | `data/properties/{id}.yaml` | property |
| Contract | `data/contracts/{id}.yaml` | contract |
| Monthly Finance | `data/finance/monthly/{YYYY-MM}.yaml` | monthlyFinance |
| Plans | `data/plans/*.yaml` | plan 各種 |
| Classification | `data/classification-registry.yaml` | classificationRegistry |
| Document I/O | `data/document-io.yaml` | documentIo |

検証: `npm run validate`（Zod · modules · regulations · 参照整合性）

---

## 13. MVP CLI 一覧（網羅）

| # | 領域 | コマンド |
|---|------|---------|
| 1 | 契約 · 物件 | `contracts` · `properties` |
| 2 | 月次収支 · CF | `finances` · `forecast` |
| 3 | 分析 · シナリオ | `analyze` · `scenario` |
| 4 | アラート · 成熟度 | `alerts` · `status` |
| 5 | 同期 · 書類 I/O | `sync all` · `io` |
| 6 | ダッシュボード | `dashboard` · `report` |
| 7 | 依存グラフ | `deps` · `impact` |
| 8 | 請求 | `invoice generate` |
| 9 | モジュール · 規程 · ISO | `modules` · `regulations` · `standards` |
| 10 | マップ | `map list` · `map resolve` · `map tree` |
| 11 | 分類 | `classification check` · `classification access` |
| 12 | Skills · Ops · Pipeline | `skills` · `ops` · `pipeline` |
| 13 | ルーティング · 委譲 | `route` · `escalate` |
| 14 | ディスパッチ · キュー · webhook | `agent dispatch` · `agent cloud` · `queue` · `webhook` |
| 15 | PR 統合 | `merge pr` |
| 16 | 監査 · コンプライアンス | `audit log` · `compliance gap` · `controls` |
| 17 | テナント · 移行 · 振込 | `tenant init` · `migrate` · `broker` |
| 18 | Secretary executive | `executive calendar list` · `conflicts` · `push` · `brief` · `secretary escalate` |
| 19 | テナント統合 · メール | `tenant setup` · `integrations status` · `mail send` · `mail compose-url` |

品質ゲート: `npm run check` = validate · demo · acme · modules --all · classification

---

## 14. 評価ドキュメント

| 文書 | スコープ |
|------|---------|
| [spec/tenant-integrations-requirements.md](spec/tenant-integrations-requirements.md) | テナント統合 · Secretary メール · setup wizard |
| [spec/company-events-requirements.md](spec/company-events-requirements.md) | 会社イベント記録（OpenOrgOS Core 外） |
| [framework-assessment.md](framework-assessment.md) | **フレームワーク**完成度ルーブリック（§7 骨格 v2 · §9 OS-100） |
| [framework-backlog.md](framework-backlog.md) | フレームワークタスク台帳（Phase E–J） |
| [framework-executive-notes.md](framework-executive-notes.md) | ブロッカー（5 行以内） |
| `tenants/{id}/docs/compliance/iso/steward-assessment.md` | **テナントインスタンス**評価（法人固有） |

---

## 15. 変更履歴（Phase changelog）

各版の全文は [spec/history/](spec/history/) 参照。

| 版 | Phase | 主な追加 |
|----|-------|---------|
| v0.2 | — | 不動産賃貸 OS（テナント分離前） |
| v0.3 | 基盤 | テナント分離 · CLI · modules tier · maturity · Skills |
| v0.4 | 骨格 v2 | acme · `map` CLI · `npm run check` ゲート · executive gitignore |
| v0.5 | L3 深度 | readiness 3 tier · pipeline daily · skill registry · **route / escalate（Phase 1）** |
| v0.6 | OS-100 | audit log · compliance gap · pipeline weekly · production_ready ×5 |
| v0.7 | Phase 2 | agent dispatch · queue DB · webhook send/ingest · escalate merge |
| v0.8 | Phase 3 | webhook serve · cloud agent watch · merge pr · queue processor |
| — | **ORG-WC Wave 4** | Wire Console prod hardening — OIDC JWKS RS256 · WebAuthn SPKI · L2 redact · Playwright smoke `:9472/:9473/:9474` · `wire-console:release-check`（[wire-console-plan.md §12](org-os/wire-console-plan.md)） |

---

## 16. 関連

- [agent_architecture.md](agent_architecture.md) — 現行パス索引
- [steward/rules/repository_layout.md](../steward/rules/repository_layout.md) — 物理パス正本
- [steward/rules/folder_access_policy.md](../steward/rules/folder_access_policy.md) — アクセス正本
- [tenants/00-README.md](../tenants/00-README.md)
