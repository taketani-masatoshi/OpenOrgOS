# Steward OS — マルチエージェントアーキテクチャ

> **正本（4 層）:** [13_rules/agent_skill_architecture.md](../13_rules/agent_skill_architecture.md) · [11_agents/](../11_agents/) · [12_skills/](../12_skills/)  
> 本書は **現行パス詳細索引（レガシー）** として維持する。

**版:** 2026-06-08 · **対象:** 株式会社MAL（段100%株主 · 番町賃貸 PROP-001 · 亀沢旅館 PROP-002）

Steward OS は **経営支援 OS**（DMS ではない）。正データは `cursor/data/`、人が読む書類は `docs/`。**8 Agent**（7 部門 + 秘書）が役割分担し、Executive Steward が **Agent 要約** 経由で統合判断を支援する。社長のスケジュール・社外窓口は **Secretary Agent** が担う（[secretary_steward_boundary.md](../13_rules/secretary_steward_boundary.md)）。

---

## Step 1: 現行フォルダ分析

### リポジトリ全体

```
Steward/
├── docs/                      【人】MD・CSV・PDF（読む・印刷・提出）
├── cursor/
│   ├── data/                  【正データ】YAML のみ
│   └── scratch/               試行（gitignore）
├── src/                       CLI（steward dashboard / validate / sync / io …）
├── schemas/                   Zod 検証定義
├── assets/                    PDF フォント等
├── tests/
├── prompts/                   【deprecated】→ 11_agents/
├── 11_agents/                 【正】Agent 定義
├── 12_skills/                 【正】Skill 定義
├── 13_rules/                  【正】原則・アクセスポリシー
├── 14_prompts/                横断 Orchestrator
└── package.json
```

### `docs/` — 人向けゾーン

| パス | 内容 | 主な利用者 |
|------|------|-----------|
| `docs/plans/` | 決算書・予実 MD（`fy2026-pl.md` 等） | Finance · Executive |
| `docs/corporate/` | 法人書類（議事録・株主名簿・税務） | Compliance · Executive |
| `docs/corporate/regulations/` | 社内規程 11 種 | Compliance |
| `docs/corporate/licenses/` | 許認可・保険・登記（records/ に原本） | Compliance |
| `docs/corporate/tax/` | 税務申告・試算 | Finance · Compliance |
| `docs/contracts/` | 契約書 MD（CTR-001〜014） | Contract |
| `docs/data/` | 計画・台帳 CSV（`steward sync all` で YAML から生成） | Finance · Contract |
| `docs/operations/` | 業務台帳テンプレ・運用ガイド | Operations · Hospitality · Finance |
| `docs/operations/lodging/` | 亀沢旅館運用（PROP-002） | Hospitality |
| `docs/operations/accounting/` | 経理テンプレ CSV | Finance |
| `docs/operations/hr/` | 人事テンプレ CSV | Operations · Compliance |
| `docs/operations/privacy/` | 個情テンプレ | Compliance |
| `docs/iso/` | ISO 方針・ギャップ・監査計画 | Compliance |
| `docs/inbox/` | 受信トレイ（未処理スキャン等） | Operations |
| `docs/outbox/` | 出力トレイ（印刷・提出 PDF） | Operations · Executive |
| `docs/reports/` | CLI 自動生成 MD（`dashboard/` 日次） | Executive |

### `cursor/data/` — 正データ（Source of Truth）

| パス | スキーマ | 説明 |
|------|---------|------|
| `company.yaml` | company | 法人基本情報 |
| `properties/PROP-001.yaml` | property | 番町ハイム312（賃貸） |
| `properties/PROP-002.yaml` | property | 亀沢旅館（旅館） |
| `contracts/CTR-*.yaml` | contract | 契約台帳 14 件 |
| `finances/monthly/{YYYY-MM}.yaml` | monthlyFinance | 月次収支 |
| `finances/fixed-costs.yaml` | fixedCosts | 本社固定費 |
| `finances/payroll.yaml` | payroll | 役員報酬 |
| `finances/loans.yaml` | loans | 借入・役員貸付 |
| `finances/cash-balance.yaml` | cashBalance | 現預金・ランウェイ |
| `plans/*.yaml` | 各種 plan | 予実・売上/費用/投資計画 |
| `operations/kamezawa-public.yaml` | facilityPublic | 亀沢公開情報 |
| `operations/kamezawa-secrets.yaml` | — | **鍵・Wi-Fi（gitignore · 機密）** |
| `hr/employees.yaml` | employeesFile | 従業員マスタ |
| `document-io.yaml` | documentIo | inbox/outbox キュー |
| `dependency-graph.yaml` | dependencyGraph | パラメータ依存マップ |

### `src/` — CLI 能力（エージェントが呼ぶ）

- `steward dashboard` → `docs/reports/dashboard/`
- `steward status` / `steward alerts` — 成熟度・アラート
- `steward sync all` — YAML → `docs/data/*.csv`
- `steward io` — inbox/outbox 台帳
- `steward contracts` / `steward properties` / `steward finances`
- `npm run validate` — スキーマ + 参照整合性

### 現状のギャップ

- エージェント役割定義がコード/ルールに散在（`.cursor/rules/steward.mdc` のみ）
- 機密ファイル（`kamezawa-secrets.yaml`）のアクセス境界が暗黙
- inbox/outbox の処理責任が未明文化
- 番町（PROP-001）専用の運用 docs が薄い（契約・財務 YAML に集約）

---

## Step 2: 8 エージェント設計（実パスマッピング）

### 1. Executive Steward Agent（経営統括）

**役割:** オーナー代理の統合判断支援。詳細編集はしない。

| 区分 | 実パス |
|------|--------|
| 読取 | `docs/reports/`（特に `dashboard/`）· `docs/plans/` · `cursor/data/plans/` · `docs/corporate/executive-remaining-tasks.md` |
| CLI | `steward dashboard` · `steward status` · `steward alerts` · `steward forecast` · `steward scenario` |
| 委譲 | Secretary + 下記 6 部門 Agent へ照会・タスク割当 |
| 禁止 | 正データ YAML の直接編集 · 機密 secrets · 契約本文の改定 |

**プロンプト:** [`11_agents/executive_steward_agent.md`](../11_agents/executive_steward_agent.md)

---

### 1b. Secretary Agent（秘書 · 社長オペ・社外窓口）

**役割:** 社長のタスク・予定・会食・1-on-1・社外連絡の一次受け。財務・契約は扱わず Executive へルート。

| 区分 | 実パス |
|------|--------|
| Primary | `cursor/data/executive/` · `docs/executive/` |
| Read（制限） | `docs/reports/dashboard/` 要約行 · `executive-remaining-tasks.md` |
| 禁止 | `cursor/data/finances/**` · `contracts/**` · secrets |
| 委譲 | 経営・財務・契約 → Executive Steward |

**プロンプト:** [`11_agents/secretary_agent.md`](../11_agents/secretary_agent.md)

---

### 2. Finance Agent（財務・計画）

**役割:** 月次収支・予実・キャッシュフロー・経理台帳の正データ管理。

| 区分 | 実パス |
|------|--------|
| Primary | `cursor/data/finances/` · `cursor/data/plans/` |
| Read/Write docs | `docs/plans/` · `docs/data/*.csv` · `docs/operations/accounting/` |
| Read only | `cursor/data/properties/`（減価償却・収益前提）· `cursor/data/contracts/`（費用按分 CTR-003 等）· `docs/corporate/tax/` |
| CLI | `steward finances` · `steward forecast` · `steward sync all` · `npm run validate` |
| 照会先 | Contract（契約費用）· Property Rental / Hospitality（物件収益）· Compliance（税務申告期限） |

**プロンプト:** [`11_agents/finance_agent.md`](../11_agents/finance_agent.md)

---

### 3. Contract Agent（契約管理）

**役割:** 契約台帳・期限アラート・draft→executed ライフサイクル。

| 区分 | 実パス |
|------|--------|
| Primary | `cursor/data/contracts/` · `docs/contracts/` · `docs/data/契約管理表.csv` |
| Read only | `cursor/data/properties/` · `cursor/data/finances/loans.yaml`（LOAN↔CTR 参照）· `docs/inbox/`（契約原本受信） |
| Write docs | `docs/contracts/CTR-*/` · `docs/data/契約管理表.csv`（sync 後確認） |
| CLI | `steward contracts list/show` · `steward alerts` · `steward deps check` |
| 照会先 | Finance（費用計画への反映）· Compliance（規程適合）· Operations（inbox 原本処理） |

**プロンプト:** [`11_agents/contract_agent.md`](../11_agents/contract_agent.md)

---

### 4. Property Rental Agent（番町賃貸 · PROP-001）

**役割:** 番町ハイム312 の賃貸運用・空室・減価償却前提・本社兼用事務所按分。

| 区分 | 実パス |
|------|--------|
| Primary | `cursor/data/properties/PROP-001.yaml` |
| Related contracts | `cursor/data/contracts/CTR-001.yaml`（賃貸）· `CTR-003.yaml`（本社兼用）· `CTR-013.yaml`（火災保険 draft） |
| Read only | `docs/plans/fy2026-pl.md`（番町行）· `docs/corporate/fy2026-keisansyorui.md` · `cursor/data/finances/` · `docs/contracts/CTR-001/` `CTR-003/` `CTR-013/` |
| Write | PROP-001 YAML · 番町関連メモ（将来 `docs/operations/rental/`） |
| 照会先 | Contract（保険・賃貸契約）· Finance（賃料収入・減価償却）· Compliance（固定資産・税務） |

**プロンプト:** [`11_agents/property_rental_agent.md`](../11_agents/property_rental_agent.md)

---

### 5. Hospitality Agent（亀沢旅館 · PROP-002）

**役割:** 旅館開業・日次運用・OTA・清掃・ゲスト対応テンプレ。

| 区分 | 実パス |
|------|--------|
| Primary | `cursor/data/properties/PROP-002.yaml` · `cursor/data/operations/kamezawa-public.yaml` · **`cursor/data/operations/kamezawa-secrets.yaml`**（唯一の secrets 編集権） |
| docs | `docs/operations/lodging/`（全テンプレ・ガイド・checklist） |
| Related contracts | `CTR-012`（清掃）· `CTR-014`（旅館保険 draft）· `CTR-002` 等 |
| Read only | `cursor/data/finances/` · `cursor/data/plans/property-revenue.yaml` |
| 禁止 | secrets を docs/ や CSV に転記 · 他エージェントへの secrets 内容開示 |
| 照会先 | Operations（inbox ゲスト書類）· Compliance（旅館業法・宿泊約款）· Finance（運営費・ADR 前提） |

**プロンプト:** [`11_agents/hospitality_agent.md`](../11_agents/hospitality_agent.md)

---

### 6. Compliance Agent（コンプライアンス・ISO）

**役割:** 社内規程・許認可・ISO ギャップ・個情・税務コンプライアンス監視。

| 区分 | 実パス |
|------|--------|
| Primary | `docs/corporate/regulations/` · `docs/corporate/licenses/` · `docs/iso/` · `docs/operations/privacy/` |
| Read only | `docs/corporate/`（議事録・株主）· `docs/corporate/tax/` · `cursor/data/company.yaml` · **`kamezawa-secrets.yaml`**（監査目的の存在確認のみ・内容コピー禁止） |
| Write | 規程 MD · ISO 評価 · privacy テンプレ · licenses INDEX |
| 禁止 | secrets の複製・平文ログ · 財務数値の改ざん |
| 照会先 | Contract（保険・委託契約）· Hospitality（運用規程整合）· Executive（総会・届出期限） |

**プロンプト:** [`11_agents/compliance_agent.md`](../11_agents/compliance_agent.md)

---

### 7. Operations Agent（業務運用・I/O）

**役割:** inbox/outbox 処理・書類フロー・業務台帳テンプレ整備・HR テンプレ。

| 区分 | 実パス |
|------|--------|
| Primary | `docs/inbox/` · `docs/outbox/` · `cursor/data/document-io.yaml` · `docs/operations/`（lodging 除く横断） |
| Sub-areas | `docs/operations/hr/` · `docs/operations/accounting/templates/`（Finance と協調） |
| Read only | 全 `docs/contracts/`（归档参照）· `cursor/data/`（I/O 関連以外は編集不可） |
| CLI | `steward io inbox add/done` · `steward io outbox list` · `steward io status` |
| 照会先 | Contract（契約原本の確定先）· Compliance（許可証归档）· Hospitality（lodging 記録） |

**プロンプト:** [`11_agents/operations_agent.md`](../11_agents/operations_agent.md)

---

## Step 3: アクセス権限表

| Agent | Primary（読書） | Read Only | Write | Forbidden | Notes |
|-------|------------------|-----------|-------|-----------|-------|
| **Executive Steward** | `docs/reports/` · `docs/plans/` · `cursor/data/plans/` | 全 specialist 領域の要約・CLI 出力 | `docs/reports/` への手動追記のみ | 全 YAML 正データ編集 · secrets · `src/` · `executive/` | 判断は人間。エージェントは提案のみ |
| **Secretary** | `cursor/data/executive/` · `docs/executive/` | dashboard 要約行 · `executive-remaining-tasks.md` | 上 Primary + `docs/executive/` | finances · contracts · secrets · 財務要約の開示 | 社外窓口。経営数値は Executive へルート |
| **Finance** | `cursor/data/finances/` · `cursor/data/plans/` | `properties/` · `contracts/` · `docs/corporate/tax/` | 上 Primary + `docs/plans/` · `docs/data/*.csv` · `docs/operations/accounting/` | secrets · `document-io.yaml` · 規程本文 | 編集後 `validate` + `sync all` 必須 |
| **Contract** | `cursor/data/contracts/` · `docs/contracts/` | `properties/` · `loans.yaml` · `docs/inbox/` | CTR YAML/MD · `契約管理表.csv` | secrets · 財務月次 · ISO 規程 | draft→executed は Operations と連携 |
| **Property Rental** | `PROP-001.yaml` | 番町関連 CTR · 財務 · 決算 MD | `PROP-001.yaml` | PROP-002 · lodging/ · secrets | 本社兼用按分は Finance/Compliance と協議 |
| **Hospitality** | `PROP-002.yaml` · `kamezawa-*` · `docs/operations/lodging/` | 関連 CTR · `property-revenue.yaml` | 上記 Primary | secrets の外部出力 · 財務 YAML | secrets は gitignore · example のみコミット可 |
| **Compliance** | `regulations/` · `licenses/` · `iso/` · `privacy/` | `company.yaml` · secrets（監査・非複製） | 規程 · ISO · privacy テンプレ | 財務数値 · 契約 fee 改定 · secrets 複製 | 届出期限は Executive へエスカレーション |
| **Operations** | `inbox/` · `outbox/` · `document-io.yaml` · `docs/operations/`（lodging 除く） | 契約 MD · corporate PDF 路径 | I/O 台帳 · inbox 処理状態 · HR テンプレ | 正データ finances/contracts/properties · secrets | lodging 実運用記録は Hospitality が主 |

### 機密境界（全エージェント共通）

| ファイル | 許可 |
|---------|------|
| `cursor/data/operations/kamezawa-secrets.yaml` | **Write:** Hospitality のみ · **Read（監査）:** Compliance · **Forbidden:** その他全員 |
| `cursor/scratch/` | 各エージェント試行可 → 確定後 Primary へ移動 |
| `docs/**/records/` | 記入済個情・スキャン原本 — Operations 归档 · Compliance 監査 |

---

## Step 4: 推奨フォルダ構造（進化目標）

**現時点では物理移行しない。** 以下は将来の `00_company/` スタイル統合ビュー。

```
Steward/
├── 00_company/                    ← 将来: docs/corporate/ + company.yaml 要約
│   ├── governance/                ← regulations/ + 議事録
│   ├── licenses/                  ← corporate/licenses/
│   └── shareholder/               ← 株主名簿
├── 01_finance/                    ← cursor/data/finances/ + docs/plans/ + docs/data/
├── 02_contracts/                  ← cursor/data/contracts/ + docs/contracts/
├── 03_properties/
│   ├── PROP-001_banchō/           ← PROP-001 + 番町 CTR
│   └── PROP-002_kamezawa/         ← PROP-002 + lodging/ + kamezawa-*
├── 04_compliance/                 ← iso/ + privacy/
├── 05_operations/                 ← inbox/outbox + hr + accounting templates
├── cursor/data/                   【維持】正データ YAML（ symlink または steward map）
├── docs/reports/                  【維持】CLI 出力
└── prompts/                       【維持】エージェント定義
```

### 移行メモ（現 layout → 進化目標）

| 現パス | 将来パス | 移行方針 |
|--------|---------|---------|
| `docs/corporate/regulations/` | `00_company/governance/regulations/` | Phase 3: リンク維持のリダイレクト MD |
| `docs/plans/` + `cursor/data/plans/` | `01_finance/plans/` | Phase 2: Finance Agent 主導で dual-write 期間 |
| `docs/contracts/` + `cursor/data/contracts/` | `02_contracts/` | Phase 2: CTR ID は不変 |
| `docs/operations/lodging/` | `03_properties/PROP-002_kamezawa/operations/` | Phase 3: Hospitality 主導 |
| （未整備）番町運用 | `03_properties/PROP-001_banchō/` | Phase 1 backlog: Rental Agent が新設 |
| `docs/iso/` + `docs/operations/privacy/` | `04_compliance/` | Phase 3 |
| `docs/inbox/` · `outbox/` | `05_operations/io/` | Phase 2: `document-io.yaml` パスは CLI で抽象化 |

**原則:** YAML 正データは `cursor/data/` に残し、進化先は **論理ビュー** として `steward map` CLI（未実装）で提供するのが安全。

---

## Step 5: 本設計で生成したファイル

| # | ファイル | 種別 |
|---|---------|------|
| 1 | `13_rules/steward_os_principles.md` | 4 層原則 |
| 2 | `13_rules/agent_skill_architecture.md` | アーキテクチャ正本 |
| 3 | `13_rules/folder_access_policy.md` | アクセスポリシー |
| 4 | `11_agents/*.md` | Agent 定義 ×8 |
| 5 | `12_skills/*.md` | Skill 定義 ×13 |
| 6 | `docs/agent_architecture.md` | 現行パス索引（本書） |
| 7 | `docs/reports/agent-summaries/` | Steward 読取面 |

---

## Step 6: 実装バックログ

### P0 — 即時（エージェント運用開始に必要）

- [ ] Cursor Rules にエージェント選択ガイドを追加（`@finance` 等の参照）
- [ ] `kamezawa-secrets.yaml` 実値作成（Hospitality · 人間承認）
- [ ] CTR-013（番町火災）· CTR-014（旅館保険）draft → executed（Contract + Operations）
- [ ] Executive 日次ルーティン: `steward dashboard` → 残タスク確認

### P1 — 短期（1–2 スプリント）

- [ ] `docs/operations/rental/` 新設 — 番町運用チェックリスト（Property Rental Agent）
- [ ] inbox 処理 SLA 定義（Operations · 48h 以内分類）
- [ ] エージェント間照会テンプレートを `docs/folder_access_policy.md` に沿って運用
- [ ] `steward deps check` を Contract/Finance 編集後の必須ステップに

### P2 — 中期（進化準備）

- [ ] `steward map` CLI — 論理フォルダ `00_company/` ビュー（移行なし）
- [ ] エージェント別 `validate` プリセット（触ったパスのみ検証）
- [ ] dashboard KPI に物件別エージェント担当列を追加
- [ ] ISO 内部監査チェックリストと Compliance Agent プロンプトの同期

### P3 — 長期（物理移行はオプション）

- [ ] Phase 2 dual-write（finance/contracts）
- [ ] symlink または steward virtual FS
- [ ] 自動エスカレーション（alerts → Executive サマリ）

---

## 関連ドキュメント

- [13_rules/folder_access_policy.md](../13_rules/folder_access_policy.md) — アクセスポリシー（正本）
- [11_agents/](../11_agents/00-このフォルダについて.md) — Agent 定義
- [12_skills/](../12_skills/00-このフォルダについて.md) — Skill 定義
- [.cursor/rules/steward.mdc](../.cursor/rules/steward.mdc)
