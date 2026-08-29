# PMO 品質引き上げ計画

**日付:** 2026-08-24  
**対象 Agent:** `project_management`（PMO · 報告先 COO）  
**基準テナント:** `mal`  
**現状:** `orgos agent readiness` **98/100**（P1 実装後 · 2026-08-24）  
**P0 後:** 91/100 · **P0 前:** 68/100  
**目標:** 運用可能 **95+**（必須コアと同帯）かつ CEO が週次で案件 RAG を見られる状態

**非対象:** プロダクトロードマップ（`product_management`）· Work Order の割当本体（`coo`）· 業種モジュール内の案件 YAML（受託 `projects.yaml` · SOW マイルストーン等）

---

## 0. なぜ上げるか

mal は業種モジュールが複数同時に動く（賃貸 · 宿泊 · 旅費 · 登記 · 医療機器 · 許認可）。いま進捗は各モジュールと COO の Work Order に分散し、**会社としての案件ポートフォリオが無い**。

PMO の価値は Jira 代替ではなく、次を決定論的に出すことにある。

- 今、何が遅れているか（RAG）
- どの契約・許認可・物件に紐づくか（リンクのみ）
- 誰にエスカレーションするか（COO / 担当 Agent）
- CEO 向けの 1 枚状況

現状の定義は「受託 · SI · 工事」に寄っており、mal の横断イニシアチブを表現できない。

---

## 1. 現状ギャップ（68 点の内訳）

| 軸 | 配点 | 現状 | 原因 |
|----|:----:|:----:|------|
| 定義 | 15 | 12 | `registry.yaml` に read/write access 未宣言 |
| Skill/CLI | 20 | 14 | Skill 2 本とも `runtime: agent` · CLI 0 |
| データ SoT | 15 | 8 | mal に `data/projects/` が無い（template の README のみ） |
| routing | 10 | 10 | `pmo-project` はある（キーワードが薄い） |
| 要約 | 15 | 9 | pulse 未実行 |
| 証拠 | 10 | 5 | roster 未投入 |
| テナント | 15 | 10 | template のみ · mal パスなし |

Skill 正本 `pm_status_review` / `pm_milestone_tracking` は見出しだけの stub。`data/projects/` にスキーマも YAML も無い。

---

## 2. 境界（混在させない）

```
CEO（承認 · スコープ変更）
  └─ Executive Steward（要約のみ）
        └─ COO（Work Order 割当 · キュー）
              └─ PMO（ポートフォリオ正本 · RAG · マイルストーン）
                    ├─ リンク → Contract CTR
                    ├─ リンク → モジュール案件 ID（登記 · 許認可 · 宿泊 等）
                    └─ リンク → routing-queue の WO id
```

| 層 | 正本 | PMO の扱い |
|----|------|-----------|
| **ポートフォリオ** | `data/projects/` | **唯一の書込 SoT** |
| **実行チケット** | `docs/reports/routing-queue/` | WO id をリンクするだけ。割当は COO |
| **業種案件** | 各モジュール YAML | `external_ref` でリンク。中身は担当モジュール Agent |
| **契約** | `data/contracts/CTR-*` | `contract_id` リンクのみ |
| **製品** | `data/product/` | 触らない（Product Management） |

**やってよい:** 案件の開閉提案、RAG、遅延一覧、ステークホルダー報告の下書き。  
**やってはいけない:** 契約変更の確定、請求金額の確定、WO の単独承認、モジュール正データの複製。

P0 でこの境界を **ADR 0043**（案: portfolio SSOT）として固定する。

---

## 3. ゴールと DoD

| ゴール | 達成イメージ | 計測 |
|--------|-------------|------|
| 正本がある | mal にポートフォリオ YAML があり validate が通る | `orgos validate` |
| 決定論で見える | LLM なしで RAG / 期限超過が出る | `orgos pmo status` · `milestones` |
| 週次で使える | pulse が実データから要約を書く | `agent-summaries/project-management/` |
| コア並み | readiness 95+ | `orgos agent readiness --agent project_management` |
| 混線しない | PS/SOW/WO と id 空間が分かれている | 契約テスト |

**完了条件（全部必須）**

- [ ] schema + CLI + Skill `runtime: cli`（最低 2、目標 4）
- [ ] mal roster に `project_management` を追加
- [ ] mal `data/projects/` に L1 案件（氏名・口座なし）
- [ ] `_template` に同じ雛形
- [ ] Vitest（schema · CLI · mal fixture）
- [ ] `orgos operator export --agent project_management`
- [ ] Chat から `pmo status` 相当が `chat:read` で叩ける
- [ ] readiness **≥ 95**

---

## 4. データ契約（P0 で固定）

```
tenants/{id}/data/projects/
  portfolio.yaml          # 索引（id · status · rag · owner_agent）
  PRJ-*.yaml              # 1 案件 1 ファイル
tenants/{id}/docs/projects/
  PRJ-*/                  # 人間向けメモ · 報告下書き
```

`PRJ-*.yaml` の必須フィールド（案）:

| フィールド | 意味 |
|-----------|------|
| `id` | `PRJ-[A-Z0-9-]+` |
| `title` | L1 案件名 |
| `status` | `proposed` · `active` · `on_hold` · `done` · `cancelled` |
| `rag` | `green` · `amber` · `red` |
| `owner_agent` | 実行担当 Agent id（operations / compliance / …） |
| `sponsor` | `ceo` 等（人間ロール。個人名は書かない） |
| `start_date` / `target_date` | ISO date |
| `milestones[]` | `id` · `title` · `due` · `status` |
| `risks[]` | `id` · `summary`（L1）· `severity` · `status` |
| `links.contract_ids` | CTR-* |
| `links.work_order_ids` | IMP-* 等 |
| `links.module_refs` | `{ module, ref }` 例: `jp_permit_application` / `APP-KAMEZAWA-RYOKAN-001` |
| `links.property_ids` | PROP-* |

金額・個人名・口座は置かない。請求は Accounting、契約本文は Contract。

---

## 5. mal 初期ポートフォリオ（L1 案）

実データは実装時に YAML 化する。計画文書には **id と趣旨だけ** 書く。

| id | 趣旨 | 担当 Agent | モジュールリンク |
|----|------|-----------|----------------|
| `PRJ-KAMEZAWA-OPS` | 亀沢旅館の稼働安定と許認可 | operations | hospitality · `APP-KAMEZAWA-RYOKAN-001` · PROP-002 |
| `PRJ-BANCHO-HQ` | 番町の本社兼用賃貸 | operations | rental · PROP-001 |
| `PRJ-CORP-REG` | 本店移転ほか法人登記案件 | secretary | jp_corporate_registration |
| `PRJ-MED-QMS` | 医療機器 QMS / GVP 運用 | medical_device_regulatory | jp_medical_device |
| `PRJ-ANTIQUE-PERMIT` | 古物商許可の取得 | compliance | jp_permit_application · `APP-ANTIQUE-DEALER-001` |

OpenOrgOS 製品そのものは **Product Management** に残す（PMO に入れない）。

---

## 6. Skill / CLI（HR `hr headcount` と同型）

決定論を先に置き、物語は後から Agent Skill に残す。

| Skill | runtime | CLI | 権限 | 内容 |
|-------|---------|-----|------|------|
| `pmo_portfolio` | **cli** | `pmo portfolio` | chat:read | 全案件 · RAG 集計 |
| `pmo_milestones` | **cli** | `pmo milestones [--days 14]` | chat:read | 期限超過 · 間近 |
| `pmo_risks` | **cli** | `pmo risks` | chat:read | open リスク |
| `pmo_show` | **cli** | `pmo show PRJ-…` | chat:read | 1 案件（リンク先 id のみ） |
| `pm_status_review` | agent | — | — | CEO 向け叙述（CLI 結果を添付） |
| `pm_milestone_tracking` | **cli に昇格** または上記へ統合 | `pmo milestones` | chat:read | stub 解消 |

既存 stub 2 本を残したまま増やさない。`pm_milestone_tracking` は CLI に寄せ、`pm_status_review` だけ LLM 叙述に使う。

コマンド置き場: `src/commands/pmo.ts` · ドメイン: `src/lib/pmo/`（`headcount-view.ts` と同じ純関数）。

---

## 7. フェーズ

### P0 — 境界と正本（目標: 80 点台） — **実装済 2026-08-24**

1. [x] ADR 0043: ポートフォリオ SSOT · COO WO · モジュール案件の三角関係  
2. [x] `schemas/projects/` + validate 組み込み  
3. [x] `_template` と mal に `data/projects/` · `docs/projects/`  
4. [x] `registry.yaml` に access.read/write を宣言  
5. [x] mal roster に `project_management` を追加  
6. [x] classification-registry に `data/projects/` を L1 で登録  
7. [x] 契約テスト: id 空間が CTR / WO / APP と衝突しない  

**出口:** validate 緑 · readiness おおよそ 82–88（SoT · tenant · 証拠が回復）。CLI はまだでも roster + パスで点は跳ねる。

### P1 — 決定論 CLI（目標: 90+） — **実装済 2026-08-24**

1. [x] `orgos pmo portfolio|milestones|risks|show`  
2. [x] Skill registry を `runtime: cli` に更新 · chat:read  
3. [x] Fact provider（ADR 0033）に `pmo.portfolio` を載せる  
4. [x] `tests/pmo-*.test.ts` · mal fixture  
5. [x] Agent 定義 MD の「使用 Skill / CLI」を HR 並みに書き直す  
6. [x] `npm run agent:capability:sync` · `operator export`  

**出口:** LLM なしで遅延案件が一覧できる · Skill/CLI 軸 20/20。

### P2 — リンクとエスカレーション（目標: 93–95）

1. `links.*` の存在チェック（壊れた CTR / 未知モジュール ref を validate 警告）  
2. RAG red またはマイルストーン超過 → COO 向け handoff 下書き（**起票は人間 / COO**）  
3. routing `pmo-project` の keyword / path を `data/projects/` に拡張  
4. `orgos agent pulse --agent project_management` を実データで実行  
5. Steward Chat の command router に read 系を載せる  

**出口:** pulse 要約あり · dashboard 軸 15/15 · 定義 15/15。

### P3 — 運用品質（目標: 95–100）

1. 週次 1 枚（`docs/projects/weekly-{YYYY-MM-DD}.md`）を CLI で生成  
2. ステークホルダー報告下書き（L1 · 社外送信は Mail Outbound）  
3. `daily` / `dashboard` への PMO RAG 1 行（Executive が読める粒度）  
4. モジュール有効時だけ `module_refs` を解決（無効モジュールは無視）  
5. スコープ変更は REG-004 稟議へリンク（Procurement / COO）。PMO はフラグだけ立てる  

**出口:** CEO が Chat で「案件状況」と聞いて CLI 結果が返る。

---

## 8. 点数の見通し

| 時点 | 定義 | Skill | SoT | route | 要約 | 証拠 | tenant | **計** |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 今 | 12 | 14 | 8 | 10 | 9 | 5 | 10 | **68** |
| P0 完了 | 15 | 14 | 15 | 10 | 13 | 9 | 15 | **91** |
| P1 完了 | 15 | 20 | 15 | 10 | 13 | 10 | 15 | **98** |
| P2 完了 | 15 | 20 | 15 | 10 | 15 | 10 | 15 | **100** |

P3 は点数より **週次運用** の価値。100 点は P2 の pulse 実行で到達しうる。

---

## 9. 実装順（ファイル）

| 順 | パス | 内容 |
|----|------|------|
| 1 | `docs/adr/0043-pmo-portfolio-ssot.md` | 境界 |
| 2 | `schemas/projects/portfolio.ts` | Zod |
| 3 | `src/lib/pmo/*.ts` | 純関数ビュー |
| 4 | `src/commands/pmo.ts` | CLI |
| 5 | `steward/core/skills/pmo_*.md` + `registry.yaml` | Skill |
| 6 | `steward/core/agents/project_management_agent.md` | 役割を横断イニシアチブに更新 |
| 7 | `tenants/_template/data/projects/` | 雛形 |
| 8 | `tenants/mal/data/projects/` | L1 実データ |
| 9 | `tenants/mal/data/operator/agents.yaml` | roster ON |
| 10 | `tests/pmo-portfolio.test.ts` | 契約 |

Agent 変更後の定例:

```bash
npm run agent:capability:sync
npm run orgos -- operator export --agent project_management
npm run orgos -- --tenant mal validate
npm run orgos -- --tenant mal agent readiness --agent project_management
npm test
```

---

## 10. リスク

| リスク | 回避 |
|--------|------|
| WO と二重管理になる | PMO はポートフォリオのみ。WO はリンク |
| モジュール YAML をコピーし始める | `module_refs` のみ。中身は読取 |
| L2 が案件メモに混入 | スキーマに個人・口座フィールドを置かない · validate |
| Product と衝突 | OpenOrgOS 製品は PMO に入れない |
| 公式 `production_ready` モジュールと勘違い | PMO は **Agent**。モジュールを新設しない |

---

## 11. 関連

- 現状採点: `orgos --tenant mal agent readiness --agent project_management`
- 参照実装: [hr_headcount.md](../../steward/core/skills/hr_headcount.md) · ADR [0033](../adr/0033-deterministic-fact-provider-registry.md)
- COO: [coo_agent.md](../../steward/core/agents/coo_agent.md)
- 秘書引き上げ（同型の計画書）: [secretary-quality-uplift-plan.md](secretary-quality-uplift-plan.md)
- 4 層: [engineering/09-openorgos-domain.md](../../steward/rules/engineering/09-openorgos-domain.md)
