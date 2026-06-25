# Steward OS — Specification v0.3

> **正本:** 本ドキュメント。v0.2 は [spec-v0.2.md](spec-v0.2.md)（履歴）· 詳細サブ仕様は [spec/](spec/) 配下。

## 1. 目的

Steward OS は **テナント分離型の経営支援フレームワーク** である。不動産賃貸・宿泊・受託等の業務モジュールを ON/OFF し、会社データを YAML 正本で蓄積し、CLI · Agent · Skill で運用する。

- **フレームワーク**（`src/` · `schemas/` · `steward/` · `docs/`）は法人非依存
- **テナント**（`tenants/{id}/`）が法人データ · 規程 · パスをバインド
- 最終判断は人間が行う

物理レイアウト正本: [steward/rules/repository_layout.md](../steward/rules/repository_layout.md)

---

## 2. 3 層 + テナント

```
フレームワーク（汎用）
├── steward/modules/{id}/     業務モジュール Agent · skills · seed/
├── steward/standards/iso/    ISO 標準方針 · 記録様式
├── steward/standards/regulations/  社内規程 catalog · テンプレ
├── steward/agents/           6 コア Agent
├── src/ · schemas/ · docs/

テナント（接続）
├── tenant.yaml               法人メタ
├── modules.yaml              業務モジュール ON/OFF · billing · パス
├── standards.yaml            ISO 有効化
├── regulations.yaml          社内規程有効化
├── data/                     正データ YAML
├── docs/                     人向け書類 · 監査記録
└── rules/                    company_context · active_context
```

| 論理パス | 解決先 |
|---------|--------|
| `data/...` | `tenants/{active}/data/...` |
| `docs/...` | `tenants/{active}/docs/...` |

```bash
export STEWARD_TENANT=mal          # または --tenant mal
npm run steward -- validate
```

---

## 3. テナント設定ファイル

| ファイル | 役割 |
|---------|------|
| `tenant.yaml` | id · 法人名 · default フラグ · **`lifecycle: skeleton \| operational`** |
| `modules.yaml` | 有効モジュール · `property_ids` · `docs_root` · `operations_*` · **`billing`** |
| `standards.yaml` | 有効 ISO 標準（`steward/standards/iso/` 参照） |
| `regulations.yaml` | 有効社内規程（catalog id → テナント施行 MD） |
| `data/ops-config.yaml` | P0 判定 · 会計年度 · records プローブ · 監査パス · **`skeleton: true`** で P0 ブロッカー抑制 |

**骨格生成:**

```bash
npm run steward -- tenant init acme --name "株式会社ACME" --from rental
npm run steward -- regulations seed          # effective REG の template → docs/company/regulations/
npm run steward -- --tenant acme validate
```

`regulations.yaml` で `enabled: true` かつ bind 充足（effective）の規程は、テナント側 `docs/company/regulations/{tenant_doc}` が必須。骨格では `regulations seed` で `[TBD]` プレースホルダ付き MD を生成する。

**参照テナント:** `tenants/demo/` — 賃貸1物件 · ガバナンス REG のみ · 契約0 · 残高未入力で validate 通過。

**Agent トークン節約:** `enabled: false` のモジュールの `agent.md` / `seed/` は読まない。有効範囲は `rules/active_context.md` に同期（`steward modules sync-context`）。

---

## 4. 業務モジュール tier

正本: [steward/modules/readiness.yaml](../steward/modules/readiness.yaml)

| tier | 意味 |
|------|------|
| **production_ready** | カタログ Agent · seed · CLI 連携が本番運用可能 |
| **seed_only** | カタログ · 雛形のみ。テナントで有効化する前に seed 展開と validate が必要 |

```bash
npm run steward -- modules list    # Tier 列を表示
```

モジュール追加手順: [steward/modules/00-このフォルダについて.md](../steward/modules/00-このフォルダについて.md)

---

## 5. 成熟度（三次元）

`steward status` · `steward ops daily` · テナント assessment で共通利用。定義の正本はフレームワーク側 [framework-assessment.md](framework-assessment.md#テナント成熟度三次元)。

| 次元 | id | 主な入力 |
|------|-----|---------|
| **準備度** | preparedness | `validate` · 規程カタログ · 予実計画 · 契約台帳 |
| **運用度** | operational | P0（`ops-config.yaml`）· 月次 finance · operations secrets/records |
| **自動化度** | automation | classification · document-io · integrity · daily/deps |

```bash
npm run steward -- status
npm run steward -- status --legacy    # 旧データ成熟度メトリクス併記
```

テナント固有のスコア例は **各テナント** `docs/compliance/iso/steward-assessment.md` に記載する（フレームワーク文書に法人名・件数を書かない）。

---

## 6. Skills CLI

Cursor 外で Skill 相当のチェックを実行。定義: [steward/skills/](../steward/skills/00-このフォルダについて.md) · 実装: `src/commands/skills.ts`

```bash
npm run steward -- skills list
npm run steward -- skills run daily
npm run steward -- skills run contract-expiry
npm run steward -- skills run permit-expiry
npm run steward -- skills run variance
npm run steward -- skills run records-check
npm run steward -- skills run p0
npm run steward -- skills run monthly-close --month 2026-06
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

---

## 7. 運用 CLI（P0 · 請求 · 予実）

```bash
npm run steward -- ops p0              # ops-config 駆動 P0 サマリ
npm run steward -- ops daily           # 成熟度 + P0 + 契約アラート

npm run steward -- invoice generate \
  --module rental --property PROP-001 \
  --from 2026-02 --to 2027-01 --fy FY2026
```

- P0 / 会計年度: [tenants/_template/data/ops-config.yaml.example](../tenants/_template/data/ops-config.yaml.example)
- 予実 v2: [spec/yojitsu-v2.md](spec/yojitsu-v2.md)
- 請求: [spec/invoice.md](spec/invoice.md)

---

## 8. データ構造（テナント `data/`）

| 領域 | パス |
|------|------|
| Company | `data/company.yaml` |
| Property | `data/properties/{id}.yaml` |
| Contract | `data/contracts/{id}.yaml` |
| Monthly Finance | `data/finance/monthly/{YYYY-MM}.yaml` |
| Plans | `data/plans/*.yaml` |
| Classification | `data/classification-registry.yaml` |
| Document I/O | `data/document-io.yaml` |

検証: `npm run validate`（Zod · modules · regulations · 参照整合性）

---

## 9. MVP CLI 一覧

1. 契約 · 物件 — `steward contracts` · `steward properties`
2. 月次収支 — `steward finances`
3. キャッシュフロー — `steward forecast`
4. 分析 · シナリオ — `steward analyze` · `steward scenario`
5. アラート — `steward alerts`
6. 成熟度 — `steward status`
7. 同期 — `steward sync all`
8. 書類 I/O — `steward io`
9. ダッシュボード — `steward dashboard`
10. 依存グラフ — `steward deps` · `steward impact`
11. 請求 — `steward invoice generate`
12. モジュール · 規程 · ISO — `steward modules` · `steward regulations` · `steward standards`
13. Skills · Ops — 上記 §6 · §7

---

## 10. 評価ドキュメント

| 文書 | スコープ |
|------|---------|
| [framework-assessment.md](framework-assessment.md) | **フレームワーク**完成度ルーブリック |
| `tenants/{id}/docs/compliance/iso/steward-assessment.md` | **テナントインスタンス**評価（法人固有） |

---

## 11. 関連

- [agent_architecture.md](agent_architecture.md)
- [tenants/00-README.md](../tenants/00-README.md)
- [spec-v0.2.md](spec-v0.2.md)（v0.2 履歴）
