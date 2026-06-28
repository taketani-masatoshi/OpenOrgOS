# Secretary Escalation — 秘書エスカレーション（Orchestrator）

**版:** 2026-06-09 · **種別:** 14_prompts（Agent ではない） · **委譲元:** Secretary → **Executive Steward** が実行

---

## 役割

段（オーナー）から Secretary 経由で入った **管轄外・横断・経営判断** の依頼を、Executive Steward が **1 スレッド内** で各専門 Agent へ照会し、**統合回答** を Secretary 返却形式に落とし込む。

**目的:** 依頼文の手動コピーを廃止し、Phase 0 の Agent 間プロトコル（[folder_access_policy.md](../rules/folder_access_policy.md) §4）を **Orchestrator 1 本** で運用可能にする。

**フロー:**

```
段 → Secretary（一次受け）
       ↓ 管轄外
     @steward/core/orchestrators/secretary_escalation.md（Steward スレッド 1 本）
       ↓
     Executive Steward（本 Orchestrator を実行）
       ↓ §4.2 照会マトリクス
     Finance / Contract / Compliance / Operations / …（各 Agent 視点）
       ↓ 統合（L2 値禁止）
     executive-notes または Secretary 返却 MD
       ↓
     Secretary → 段へ伝達（Q1/Q2/Q3 一行 + アクション最大 3）
```

**4 層:** 本プロンプトは Orchestrator。正データ編集は各 Primary Agent へ委譲。Executive Steward は **要約・統合のみ**。

---

## 起動

| 経路 | 操作 |
|------|------|
| **推奨** | Steward 用 Cursor スレッドを **1 本** 用意し、Secretary がエスカレーション時に `@steward/core/orchestrators/secretary_escalation.md` を **1 回** 付与 |
| 代替 | Secretary スレッド内でユーザーが `@orchestrator` 相当として上記を 1 回起動（同一スレッドで Executive 役を実行） |

Secretary は **依頼文を手書きコピーしない**。本 Orchestrator が §4.1 照会フォーマットを **自動生成** する。

---

## 入力（Secretary → Orchestrator）

Secretary は起動時に以下を埋める（不足は Orchestrator が TBD と明示）。

```markdown
## エスカレーション入力 YYYY-MM-DD

**件名:** （一行）
**背景:** （なぜ今 · 誰から · 期限）
**質問:**
1. （具体的 1 点目）
2. （任意）
3. （任意）
**機密:** L0 / L1 / L2（L2 は secrets 内容を含めない · パスのみ可）
**希望回答形式:** 是非 / 手順 / ドラフト MD / 段のアクションリスト
**Secretary メモ:** （段の口調・社外可否など任意）
```

---

## Executive Steward の動き（Step 1–6）

### Step 1 — 受理・正規化

- 入力を §4.1 **照会フォーマット** に正規化（FROM: Secretary → TO: 各 Agent）
- `steward route match --text "..."` または `--path ...` で [routing/registry.yaml](../core/routing/registry.yaml) を参照（任意 · 補助）
- **classification:** L2/L3 リソースの **値** は照会文・統合回答に含めない

### Step 2 — 照会マトリクス（§4.2）で Agent 割当

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
| **個情法 · ISO · Git 機密範囲** | **Compliance**（主）+ Operations（归档） |
| **配偶者・利害関係者データの Git 扱い** | **Compliance** + Executive（方針） |

複数 Agent が必要な場合、**並列照会** → **Executive が統合**（競合は §4.4）。

### Step 3 — 各 Agent 視点の回答（同一スレッド内）

各 Agent は [folder_access_policy.md](../rules/folder_access_policy.md) §4.3 **回答フォーマット** で応答:

```markdown
## 回答 [TO ← FROM] YYYY-MM-DD

**結論:** （一行）
**根拠:** パス + 引用（L2 値なし）
**推奨アクション:** （編集するファイルを明示 · 人間承認前提）
**エスカレーション:** 要 / 不要
```

### Step 4 — 統合（Executive Steward）

- 矛盾を §4.4 で解決（Primary 優先 · 不能時は両案 + 影響を段へ）
- **L2 具体値禁止**（口座残高 · secrets · stakeholders 実名 · 配偶者 PII）
- 統合ブロックを下記テンプレに記載

### Step 5 — 出力（固定パス）

**統合回答の正本パス（固定）:** `docs/reports/executive-notes/YYYY-MM-DD-escalation-{slug}.md`

| 先 | パス | 用途 |
|----|------|------|
| 監査・履歴 | `docs/reports/executive-notes/YYYY-MM-DD-escalation-{slug}.md` | 統合回答全文（L2 除外）· **必ずここに保存** |
| Secretary 返却 | 上記ファイルを読み、チャットで短縮 relay | 下記 Step 6 |

チャットのみに統合回答を残さない。Secretary relay の根拠は **executive-notes MD のみ**。

### Step 6 — Secretary へ返却（relay 手順 · 3 行）

1. `docs/reports/executive-notes/YYYY-MM-DD-escalation-{slug}.md` を開く（L2 値は転記しない）
2. 「統合結論」「Q1/Q2/Q3 一行回答」「段のアクション最大 3 件」を抽出し、段向けに **2–6 行** に短縮
3. 段へ relay。**数値は MD 記載値のみ**（再計算禁止）· 原文 MD へのリンクまたはファイル名のみ提示可

---

## 統合回答テンプレ（Executive 出力）

```markdown
# エスカレーション統合回答 YYYY-MM-DD

**件名:** …
**照会 Agent:** Compliance, Operations, …
**機密上限:** L1（出力）

## 統合結論（Secretary 転用可）
（2–4 行 · L2 値なし）

## Q1 / Q2 / Q3 回答
| # | 一行結論 | 根拠パス（値なし） |
|---|----------|-------------------|
| Q1 | … | `docs/...` |
| Q2 | … | … |
| Q3 | … | … |

## 段のアクション（最大 3 件）
1. …
2. …
3. …

## 委譲・未決
- …

## Secretary 返却ブロック（コピー用）
<!-- Secretary: 以下を段へ -->
**Q1:** …
**Q2:** …
**Q3:** …
**次:** ①… ②… ③…
```

---

## Secretary 返却形式（段向け）

- **Q1 / Q2 / Q3:** 各 **一行結論**（敬語 · 冗長禁止）
- **段のアクション:** 最大 **3 件**（チェックボックス可）
- 根拠パス・Agent 名は **段が聞かない限り省略**
- 社外共有不可の内容は **社内のみ** と明示

---

## 読取パス（Executive / 照会 Agent）

```
docs/reports/agent-summaries/          # 各 Agent 要約（Executive 主読取）
docs/reports/dashboard/                # KPI 行のみ
docs/company/executive-remaining-tasks.md
data/classification-registry.yaml      # RES-* · 機密階層
steward/rules/folder_access_policy.md  # §4 プロトコル
steward/core/routing/registry.yaml          # ルート補助（任意）
tenants/{id}/docs/compliance/          # 個情 · ISO 記録（Compliance）
steward/core/agents/                        # 委譲先 Agent MD
```

**Forbidden（Executive）:** `data/executive/**` 直読 · L2 secrets 値 · stakeholders 実データ

---

## 書込パス（許可）

```
docs/reports/executive-notes/          # 統合回答 MD
docs/reports/routing-queue/            # handoff 履歴（任意 · route handoff 連携）
```

正データ YAML 編集は **各 Primary Agent へ委譲**（本 Orchestrator は起稿しない）。

---

## 委譲

| タスク | 委譲先 |
|--------|--------|
| 個情法 · ISO · Git 機密範囲 | [compliance_agent.md](../core/agents/compliance_agent.md) |
| inbox · 归档 | [operations_agent.md](../core/agents/operations_agent.md) |
| 契約 · 保険 | [contract_agent.md](../core/agents/contract_agent.md) |
| 予実 · CF | [finance_agent.md](../core/agents/finance_agent.md) |
| 社長予定 · 返却 | [secretary_agent.md](../core/agents/secretary_agent.md) |
| 経営優先度 | [executive_steward_agent.md](../core/agents/executive_steward_agent.md) |

---

## サンプル走査（配偶者データ · Git 外 · 個情法/ISO）

**入力（Secretary）:**

```markdown
## エスカレーション入力 2026-06-09

**件名:** 配偶者・利害関係者データの Git 管理方針
**背景:** 段から「stakeholders を Git に載せないで」と指示。Compliance と ISO の整合を確認したい。
**質問:**
1. 現行の Git 追跡範囲で個情法上問題ないか？
2. ISO 27001 的に gitignore だけで足りるか、別保管は必要か？
3. Secretary が触る executive データと stakeholders の境界は？
**機密:** L2（パスのみ · 実名・内容は含めない）
**希望回答形式:** 是非 + 段のアクションリスト
```

**Step 2 割当:** Compliance（主）· Operations（归档）· Secretary（境界確認）

**Compliance 回答（例）:**

```markdown
## 回答 [Executive ← Compliance] 2026-06-09

**結論:** stakeholders / 配偶者プロフィールは Git 外（gitignore）が正。個情法上、必要最小限・目的外利用禁止。
**根拠:** `data/classification-registry.yaml` RES-EXEC-* · `tenants/mal/docs/compliance/privacy/git-history-remediation.md`
**推奨アクション:** `*.example.yaml` のみ追跡維持 · filter-repo は Compliance 段承認後
**エスカレーション:** filter-repo 実施時は Executive → 段判断
```

**Operations 回答（例）:**

```markdown
## 回答 [Executive ← Operations] 2026-06-09

**結論:** 正本は gitignore 配下 + ローカル/社内 vault。inbox 経由のスキャンは `**/records/**` へ直接入れない。
**根拠:** `folder_access_policy.md` §1.3 L2 vault
**推奨アクション:** 受領書類は Operations が inbox → 分類 → vault 路径を document-io に記録
**エスカレーション:** 不要
```

**Secretary 返却ブロック（例）:**

```
**Q1:** 現行どおり Git 外管理で個情法上妥当です。実データのコミット履歴がある場合は filter-repo が別途必要です。
**Q2:** gitignore に加え、アクセス権限と保管場所の社内ルール文書化が ISO 的に望ましいです。
**Q3:** Secretary は calendar/tasks/one-on-ones のみ SoT。stakeholders・配偶者詳細は Secretary も Git 上では扱いません。
**次:** ①Compliance 記載の filter-repo を段承認待ち ②example のみ Git 維持を確認 ③vault 保管先を Operations と合意
```

---

## CLI（実装済 · SEC-3/4）

```bash
# 1 コマンド dispatch（Secretary 優先）
npm run orgos -- secretary escalate --dispatch --subject "件名" --q "質問1"

# カレンダー
npm run orgos -- executive calendar push --dry-run
npm run orgos -- executive calendar pull --since 2026-06-01

# merge 完了時 Secretary relay ブロックが stdout に出力
npm run orgos -- escalate merge --id IMP-...
```

---

## 将来 Phase 2+（backlog · SEC4-*）

- **SEC4-7** tasks `archived` ステータス — schema + 移行 CLI
- **SEC4-8** `npm run daily` / weekly に brief オプトイン
- **SEC4-9** launchd リマインド — [launchd テンプレ](../../tenants/mal/docs/executive/launchd-com.steward.executive-backup-reminder.plist.example) 作成済 · 段 load 要
- Cursor SDK 完全自動 POST — dispatch + webhook 基盤済

### consult サンプル — 配偶者・家族（P2-2）

```markdown
@steward/core/orchestrators/secretary_escalation.md

## エスカレーション入力 2026-06-09

**件名:** 配偶者・利害関係者データの Git 管理方針
**背景:** 段から stakeholders を Git に載せないよう指示。Compliance/ISO 整合を確認したい。
**質問:**
1. 現行 Git 追跡範囲で個情法上問題ないか？
2. gitignore のみで足りるか？
3. Secretary 管轄と stakeholders の境界は？
**機密:** L2
**希望回答形式:** 是非 + アクションリスト
```

---

## 起動例

段から「配偶者を stakeholders に載せるか」と聞かれた場合の照会例。本 Orchestrator を起動し Compliance + Secretary へ §4.2 照会。

**Q 例:** 家族情報は `records/`（L2 vault）か `stakeholders.yaml`（L1 · gitignore）か STK プロフィール MD か？  
**原則（Compliance 視点）:** 業務上必要な最小限のみ L1 executive に。住所・個人携帯の詳細は `records/` + id リンク。Git 追跡は example のみ。

---

## 関連

- [folder_access_policy.md](../rules/folder_access_policy.md) §3–§4
- [secretary_steward_boundary.md](../rules/secretary_steward_boundary.md)
- [executive_steward_agent.md](../core/agents/executive_steward_agent.md)
- [routing/README.md](../core/routing/README.md)
