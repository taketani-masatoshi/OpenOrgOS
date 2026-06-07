# Steward OS — フォルダアクセスポリシー

**版:** 2026-06-08 · **正本:** 本ファイル（`steward/rules/`） · **上位:** [agent_skill_architecture.md](agent_skill_architecture.md) · **構成:** [repository_layout.md](repository_layout.md)

本書は 8 エージェント間の **読取・編集・禁止** を運用レベルで定義する。業務モジュールの ON/OFF は **`tenants/{id}/modules.yaml`** が正本（例示物件名は架空のサンプル商事）。

**4 層:** Steward → Agent → Skill → Data。Steward は [agent-summaries](../docs/reports/agent-summaries/) の要約を原則読取する。

---

## 1. 基本原則

### 1.1 ゾーン分離

**テナント:** 下表の `data/` · `docs/` は **論理パス**（物理: `tenants/{id}/data/` · `tenants/{id}/docs/`）。切替: `STEWARD_TENANT` または `--tenant`。正本: [repository_layout.md](repository_layout.md) · [tenants/00-README.md](../../tenants/00-README.md)

| ゾーン | パス | ルール |
|--------|------|--------|
| 正データ | `data/**/*.yaml` | 編集後 **必ず** `npm run validate` |
| 人向け | `docs/**` | MD/CSV/PDF。YAML から `steward sync all` で CSV 再生成 |
| テナントルール | `tenants/{id}/rules/` | 会社固有コンテキスト（`company_context.md`） |
| 試行 | `scratch/` | gitignore。確定後 Primary へ移動 |
| プログラム | `src/` `schemas/` `steward/` | エージェントは原則触らない（開発タスク除く） |

### 1.2 正データ優先

- `docs/` と YAML が矛盾した場合、**YAML が正**。
- CSV（`docs/exports/`）は生成物。手編集した場合は Finance/Contract が YAML へ逆反映するか、次回 sync で上書きされることを確認する。

### 1.3 機密階層

| レベル | 例 | Git | AI 自動 | AI @file |
|--------|-----|-----|---------|----------|
| L0 公開 | `*-public.yaml`（施設公開情報） | 追跡 | ○ | ○ |
| L1 社内 | 財務 YAML · 契約 MD | 追跡 | ○ | ○ |
| L2 機密 | `bank-accounts.yaml` · secrets | **gitignore** | △ on_demand | ○ |
| L2 vault | `**/records/**` 個情 | **gitignore** | **× blocked** | 明示のみ |
| L3 禁止出力 | L2 の転記 | — | — | **チャット/docs 不可** |

**3 境界:** `.gitignore`（Git）· `.cursorignore`（AI 自動）· `sanitize-output`（tracked MD 書込）· `steward broker`（振込）。

正本: `data/classification-registry.yaml` · `.cursor/rules/data-classification.mdc`

---

## 2. エージェント別詳細ポリシー

| # | Agent | 日本語 | 節 |
|---|-------|--------|-----|
| 1 | Executive Steward | 経営統括 | §2.1 |
| 2 | Secretary | 秘書 | §2.8 |
| 3 | Finance | 財務・計画 | §2.2 |
| 4 | Contract | 契約管理 | §2.3 |
| 5 | Property Rental | 賃貸モジュール | §2.4 |
| 6 | Hospitality | 宿泊モジュール | §2.5 |
| 7 | Compliance | コンプライアンス | §2.6 |
| 8 | Operations | 業務運用 | §2.7 |

索引: [steward/agents/00-このフォルダについて.md](../steward/agents/00-このフォルダについて.md)

---

### 2.1 Executive Steward Agent

**目的:** 経営判断の材料を統合し、専門エージェントへ委譲する。

| 操作 | 許可 |
|------|------|
| 読取（Primary） | `docs/reports/dashboard/` · `docs/reports/agent-summaries/` · `docs/company/executive-remaining-tasks.md` |
| 読取（例外） | 要約未生成時のみ `docs/plans/` 要約 MD · CLI 出力 |
| 書込 | `docs/reports/executive-notes/`（注釈のみ） |
| 禁止 | 全 YAML 編集 · `data/**` 直読 · secrets · 契約・規程の直接改定 |

**CLI 必須セット（日次）:**
```bash
npm run steward -- dashboard
npm run steward -- status
npm run steward -- alerts
```

---

### 2.2 Finance Agent

**目的:** 月次収支・予実・キャッシュフロー・経理テンプレの整合。

| パス | 権限 |
|------|------|
| `data/finance/**` | R/W |
| `data/finance/bank-accounts.yaml` | **R/W（L2 · gitignore · 口座番号）** |
| `data/classification-registry.yaml` | R |
| `data/plans/**` | R/W |
| `docs/plans/**` | R/W |
| `docs/exports/*.csv` | R/W（sync 後確認） |
| `docs/finance/accounting/**` | R/W |
| `data/properties/**` | R（減価・収益前提） |
| `data/contracts/**` | R（費用按分） |
| `docs/company/tax/**` | R |
| `document-io.yaml` | **禁止** |

**編集後チェックリスト:**
1. `npm run steward -- deps check --file <編集ファイル>`
2. `npm run validate`
3. `npm run steward -- sync all`（CSV 利用時）
4. 関連 MD（`fy2026-pl.md` 等）の数値整合

---

### 2.3 Contract Agent

**目的:** 契約ライフサイクル（draft → executed → 更新・終了）。

| パス | 権限 |
|------|------|
| `data/contracts/CTR-*.yaml` | R/W |
| `docs/contracts/CTR-*/**` | R/W |
| `docs/exports/契約管理表.csv` | R/W |
| `data/finance/loans.yaml` | R（LOAN↔CTR） |
| `data/properties/**` | R |
| `docs/io/inbox/**` | R（契約原本の受信確認） |
| `data/executive/stakeholders.yaml` | R（`contract_ids` 紐づく STK のみ · gitignore） |
| `docs/executive/stakeholders/**` | R（同上 · gitignore） |
| `finances/monthly/**` | **禁止** |

**状態遷移:**
- `draft` → `executed`: Operations が inbox 原本を `docs/contracts/` または `licenses/records/` へ归档後、Contract が YAML status 更新
- 期限 30 日以内: `steward alerts` で Executive へ自動エスカレーション（CLI 既存）

---

### 2.4 Property Rental Agent（賃貸モジュール · 例: PROP-001）

**目的:** `modules.yaml` で `agent: rental` · `enabled: true` の物件運用（例: みなとビル501）。

| パス | 権限 |
|------|------|
| モジュール対象 `data/properties/PROP-*.yaml` | R/W |
| 賃貸関連 `docs/contracts/CTR-*/**` | R/W（Contract と協調） |
| `data/finance/**` | R |
| `modules.yaml` の `docs_root/**` | R/W |
| **他モジュール**の物件 · operations · secrets | **禁止** |

**協調必須事項:**
- CTR-003 本社兼用按分 → Finance + Compliance
- 減価償却パラメータ変更 → Finance が `expense-plan` / 月次へ反映

---

### 2.5 Hospitality Agent（宿泊モジュール · 例: PROP-002）

**目的:** `modules.yaml` で `agent: hospitality` · `enabled: true` の施設運用（例: 緑丘ゲストハウス）。

| パス | 権限 |
|------|------|
| モジュール対象 `data/properties/PROP-*.yaml` | R/W |
| `operations_public` · `operations_secrets`（modules.yaml） | R/W（secrets は **唯一**） |
| `docs_root/**` | R/W |
| `docs/contracts/CTR-*/**`（宿泊関連） | R |
| **他モジュール**の物件 · 契約 | **禁止** |
| `data/plans/property-revenue.yaml` | R |
| secrets → docs/ 転記 | **禁止** |

**secrets 運用:**
- リポジトリには `{facility}-secrets.yaml.example` のみコミット
- 実値は `cp example secrets` → ローカル/gitignore
- チャットで鍵番号・Wi-Fi パスワードを出力しない（「secrets ファイルを更新済」と報告のみ）

---

### 2.6 Compliance Agent

**目的:** 規程・許認可・ISO・個情・税務コンプライアンス。

| パス | 権限 |
|------|------|
| `docs/company/regulations/**` | R/W |
| `docs/company/licenses/**` | R/W |
| `docs/compliance/iso/**` | R/W |
| `docs/compliance/privacy/**` | R/W |
| `docs/company/tax/**` | R |
| `data/company.yaml` | R |
| `*-secrets.yaml` | R（存在・項目充足監査のみ。値の複製禁止） |
| 財務 YAML · 契約 fee | **禁止** |

**エスカレーション（→ Executive）:**
- 総会・届出期限 30 日以内
- ISO 重大ギャップ（steward-assessment.md の赤項目）
- 個情インシデント記録の新規行

---

### 2.7 Operations Agent

**目的:** 書類 I/O · inbox/outbox · 横断業務台帳 · HR テンプレ。

| パス | 権限 |
|------|------|
| `docs/io/inbox/**` | R/W |
| `docs/io/outbox/**` | R/W |
| `data/document-io.yaml` | R/W |
| `docs/company/hr/**` | R/W |
| `docs/finance/accounting/templates/**` | R/W（Finance と協調） |
| 宿泊モジュール `docs/properties/*/operations/**` | R（実運用記録は Hospitality が主） |
| `data/finance/**` `contracts/**` `properties/**` | **禁止** |
| secrets | **禁止** |

**I/O フロー:**
```bash
# 受信
npm run steward -- io inbox add --from ./scan.pdf --category licenses --title "許可証"
# 処理完了 → 归档
npm run steward -- io inbox done INB-001 --archive docs/company/licenses/ryokan/records/x.pdf
# 状態確認
npm run steward -- io status
```

---

### 2.8 Secretary Agent

**目的:** 社長のスケジュール・タスク・1-on-1・社外連絡の一次受けと調整下書き。社外の主インターフェース（財務・契約は扱わない）。

| パス | 権限 |
|------|------|
| `data/executive/**` | R/W（Primary · SoT） |
| `data/executive/stakeholders.yaml` | R/W（gitignore · ローカル正本） |
| `docs/executive/stakeholders/**` | R/W（gitignore · プロフィール） |
| `docs/executive/**` | R/W |
| `docs/reports/dashboard/` | R（**要約行のみ**） |
| `docs/reports/executive-notes/` | R（サニタイズ済みのみ） |
| `docs/company/executive-remaining-tasks.md` | R |
| `data/hr/employees.yaml` | R |
| `data/company.yaml` | R |
| `data/finance/**` `contracts/**` `plans/**` | **禁止** |
| `*-secrets.yaml` · `**/records/**` | **禁止** |

**境界:** [secretary_steward_boundary.md](secretary_steward_boundary.md)

**編集後チェックリスト:**
1. `npm run validate`
2. 社外下書きは人間承認前に送信しない
3. `external_visible: false` 予定を社外出力に含めない

**Executive へルートする例:**
- ランウェイ・予実 → Executive → Finance
- 契約更新・保険 → Executive → Contract
- 許認可 → Executive → Compliance

---

## 3. エスカレーション経路

```
                    ┌─────────────────────┐
                    │  Executive Steward  │
                    │  （人間最終判断）    │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
    期限・資金 P0          規程・届出 P0          運用停止 P0
         │                     │                     │
    Contract              Compliance              Hospitality
    Finance               Operations              Operations
         │                     │                     │
         └─────────────────────┴─────────────────────┘
                               │
                    相互照会（下記 §4）
```

| トリガー | 一次担当 | エスカレーション先 | SLA |
|---------|---------|-------------------|-----|
| 契約期限 ≤30 日 | Contract | Executive | 即日 |
| 保険 draft（CTR-013/014） | Contract | Executive + Property/Hospitality | P0 |
| ランウェイ <3 ヶ月 | Finance | Executive | 24h |
| inbox 未処理 >7 日 | Operations | Executive | 48h |
| ISO 監査指摘 | Compliance | Executive | 次回総会前 |
| secrets 未作成 | Hospitality | Executive | 開業前必須 |
| YAML validate 失敗 | 編集エージェント | 該当 Primary の上位 | 編集完了前 |

---

## 4. エージェント間照会プロトコル

### 4.1 照会フォーマット

他エージェントへ渡すときは以下の構造を使う（日本語）。

```markdown
## 照会 [FROM → TO] YYYY-MM-DD

**件名:** （一行）
**背景:** （なぜ今必要か）
**参照パス:** `data/...` または `docs/...`
**質問:** （具体的に 1–3 点）
**希望回答形式:** 数値 / 是非 / ドラフト MD / CLI コマンド
**期限:** （任意）
**機密:** L0/L1/L2（L2 は secrets 内容を含めない）
```

### 4.2 照会マトリクス（誰に聞くか）

| 状況 | 照会先 |
|------|--------|
| 契約費用を予実へ反映 | Finance ← Contract |
| 賃貸モジュール保険加入状況 | Contract ← Property Rental |
| 宿泊モジュール清掃単価変更 | Contract ← Hospitality |
| 減価償却・固定資産 | Finance ← Property Rental |
| 旅館約款と規程の整合 | Compliance ← Hospitality |
| 許可証スキャンの归档先 | Operations ← Compliance |
| 契約原本の inbox 処理 | Operations ← Contract |
| 税務申告期限・按分 | Compliance ← Finance |
| 物件別収益前提 | Finance ← Property Rental / Hospitality |
| 経営優先度判断 | Executive ← 任意 |
| 社長スケジュール・会食調整 | Secretary |
| 社外からの財務要求 | Secretary → 人間（断る） |
| 1-on-1 準備 | Secretary |

### 4.3 回答フォーマット

```markdown
## 回答 [TO ← FROM] YYYY-MM-DD

**結論:** （一行）
**根拠:** パス + 引用
**推奨アクション:** （編集するファイルを明示）
**エスカレーション:** 要 / 不要
```

### 4.4 競合解決

同一ファイルへの同時編集要求:

1. **Primary エージェントが優先**（Step 3 権限表）
2. 跨領域（例: CTR-003 按分）→ Finance 主導 · Property Rental + Compliance レビュー
3. 解決不能 → Executive が人間に判断材料を提示（両案 + 影響）

---

## 5. 監査・ログ

| 項目 | 方法 |
|------|------|
| YAML 変更 | git commit メッセージに `[finance]` `[contract]` 等タグ推奨 |
| validate | CI / ローカル `npm run validate` |
| I/O | `document-io.yaml` の inbox/outbox 履歴 |
| secrets | コミット禁止（`.gitignore`）。example  diff のみレビュー |
| エージェント照会 | Cursor スレッドまたは `docs/reports/` への要約（L2 除外） |

---

## 6. 違反時の対応

| 違反 | 対応 |
|------|------|
| 禁止パスへの書込 | 即 revert · Primary エージェントへ通知 |
| secrets 漏洩 | 該当 credential ローテーション · Compliance 記録 |
| validate 失敗のコミット | マージ禁止 · 編集エージェントが修正 |
| CSV/YAML 不整合 | `sync all` または YAML へ逆反映 |

---

## 関連

- [repository_layout.md](repository_layout.md)
- [steward_os_principles.md](steward_os_principles.md)
- [agent_skill_architecture.md](agent_skill_architecture.md)
- [steward/agents/](../steward/agents/00-このフォルダについて.md)
- [steward/skills/](../steward/skills/00-このフォルダについて.md)
- [data/00-README.md](../data/00-README.md)
