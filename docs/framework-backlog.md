# Steward OS — フレームワークバックログ（OS-100）

**正本:** [framework-assessment.md](framework-assessment.md) §9 · [spec.md](spec.md)  
**品質ゲート:** `npm run check && npm test`

**状態: OS-99+ Epic 進行中 · 製品 99/100 · 会社 OS **93/100**（`status --os-99` · Cycle 1）**

---

## Phase ORG-J — 組織 OS · 法域パック（2026-06）

| ID | 内容 | 状態 |
|----|------|:----:|
| ORG-J0 | jurisdiction-matrix · jurisdiction-pack-contract | [x] |
| ORG-J1 | tenant.yaml jurisdiction · schemas/jurisdiction.ts · loadJurisdictionPack | [x] |
| ORG-J2 | JP catalog 移設 · 旧 catalog 非正本化 | [x] |
| ORG-J3 | US C-Corp pack · tenants/us-demo · chart currency 緩和 | [x] |
| ORG-J4 | regulations jurisdiction lookup · active_context · travel_booking REG | [x] |
| ORG-J5 | SG / EE / HK pack + sg-demo · ee-demo · hk-demo | [x] |

---

## Phase ORG-J7 — 全球法域 · 組織形態選択（2026-06）

| ID | 内容 | 状態 |
|----|------|:----:|
| ORG-J7-1 | countries.yaml 249 法域 · ISO alpha-2 · stub/_stub | [x] |
| ORG-J7-2 | entity-forms 法域依存 · JP 23 形態 · US/DE subdivision | [x] |
| ORG-J7-3 | LLC · Partnership · NPO 等スコープ内化 | [x] |
| ORG-J7-4 | agents/registry.yaml · canonical-sectors.yaml | [x] |
| ORG-J7-5 | `jurisdiction countries` · `entity-forms` CLI | [x] |

---

| ID | 内容 | 状態 |
|----|------|:----:|
| ORG-J6-1 | `steward/jurisdiction-packs/{code}/` + `pack.manifest.yaml`（owner · repository） | [x] |
| ORG-J6-2 | `packs.lock.yaml` pin · registry 索引化 | [x] |
| ORG-J6-3 | pack 内 `modules/` 解決 · `jurisdiction packs check` | [x] |
| ORG-J6-4 | `jurisdiction-oss-governance.md` · pack_contract.md | [x] |
| ORG-J6-5 | GitHub 独立リポジトリ公開 · `packs pin --source github:` | [x] |

---

## Phase ORG-J8 — TJS-11 目標法域（2026-06）

**正本:** [org-os/tjs-11-target-jurisdictions.md](org-os/tjs-11-target-jurisdictions.md) · 評価: [framework-assessment.md](framework-assessment.md) §11 · **チケット:** [framework-backlog-tickets-bc.md](framework-backlog-tickets-bc.md)

| ID | 内容 | 状態 |
|----|------|:----:|
| ORG-J8-0 | TJS-11 文書 · pack_ready DoD · 三軸評価式 | [x] |
| ORG-J8-1 | TJS-EU 方針確定（**[x] 案 A** EU メタ pack · subdivisions DE FR GB） | [x] |
| ORG-J8-2 | AU pack + au-demo · pack_ready | [x] |
| ORG-J8-3 | CN pack + cn-demo · pack_ready | [x] |
| ORG-J8-4 | TW pack + tw-demo · pack_ready | [x] |
| ORG-J8-5 | MY pack + my-demo · **ms** locale registry | [x] |
| ORG-J8-6 | AE pack + ae-demo · **ar** locale registry | [x] |
| ORG-J8-7 | RU pack + ru-demo · **ru** locale registry | [x] |
| ORG-J8-8 | TJS-11 法域 11/11 pack_ready · assessment §11 更新 | [x] |

---

| ID | モジュール | tier | 状態 |
|----|-----------|------|:----:|
| MOD-ADD-1 | `software_outsourcing` ソフトウェア受託 | activation_ready | [x] |
| MOD-ADD-2 | `event_operations` イベント運営 | activation_ready | [x] |
| MOD-ADD-3 | `real_estate_brokerage` 不動産仲介 | activation_ready | [x] |
| MOD-ADD-4 | `property_management` 管理業務 PM | activation_ready | [x] |

カタログ **15→19** · `modules check --all` green

---

## Phase ORG-P — Org 承認根幹（2026-06）

**正本:** [org-os/org-approval-schema.md](org-os/org-approval-schema.md)

| ID | 内容 | 状態 |
|----|------|:----:|
| ORG-P0 | wire 分離 · gate 純化 · reject audit · kind 統一 | [x] |
| ORG-P1 | audit bridge · queue マッピング · 二重書き除去 | [x] |
| ORG-P2 | identity adapter · delegation manifest · 法域 pack · external verify | [x] |
| ORG-P3 | wire-governance 命名統一 | [x] |
| ORG-P4 | audit 冪等 · delegation 署名 · tenant adapter 契約 · deprecated 掃除 | [x] |
| ORG-P5 | tenant adapter 拡張 · legacy doc · audit SoT 方針 | [x] |

---

## Phase ORG-C — OrgOS 完成度向上（2026-06）

**正本:** [org-os/orgos-completion-plan.md](org-os/orgos-completion-plan.md) · interface spec: [orgos-interface-spec.md](org-os/orgos-interface-spec.md)

| ID | 内容 | 状態 |
|----|------|:----:|
| ORG-C0 | 境界固定 — interface spec · assessment §13 · 本 Phase 登録 | [x] |
| ORG-C1 | 単独 OrgOS 閉ループ — standalone validate · 内部 envelope · demo | [x] |
| ORG-C2 | Wire 証拠 — witness emit · reconcile · hub verify remote | [x] |
| ORG-C3 | Adapter 契約 — Core drift · module 76→90% | [x] |
| ORG-C4 | Community 整合 — operators · revocation SLA · governance CLI | [x] |
| ORG-C5 | 受入 — 2 デモ · runbook · OrgOS 完成度 ≥85% | [x] |
| **ORG-99** | **採点改善** — チェックリスト + **厳格** 二重採点 · 文書矛盾解消 | [x] · [orgos-scoring-methodology.md](org-os/orgos-scoring-methodology.md) |
| **ORG-VOC** | **用語集** — OrgOS · Core · Wire · Witness · Agent | [x] · [orgos-vocabulary.md](org-os/orgos-vocabulary.md) |

---

## Phase OS-99 — 会社 OS 99+ 連続改善

**ミッション:** 会社 OS composite **≥ 99** まで採点 → 修正 → 再採点を繰り返す。正本: [framework-assessment.md](framework-assessment.md) §10

| ID | 内容 | 状態 |
|----|------|:----:|
| OS99-0 | `steward status --os-99` · `os-score.ts` · §10 採点式 | [x] |
| OS99-1 | ops p0 → p0-closing-register リンク · 段向け 3 アクション | [x] |
| OS99-2 | REF-4c cli registrar 分割（製品 98→99） | [x] |
| OS99-3 | MAL P0 5 件クローズ（**人間** · Contract/Finance/Ops） | [ ] |
| OS99-4 | R-001 filter-repo（段承認 · Compliance） | [ ] |
| OS99-5 | composite ≥ 99 再評価 · Epic 完了 | [ ] |

---

## Phase L — 評価整合 + 技術 P0（2026-06-09）

**Direction C チケット:** [framework-backlog-tickets-bc.md](framework-backlog-tickets-bc.md)

| ID | タスク | 状態 |
|----|--------|:----:|
| FIX-A1 | `npx tsc --noEmit` exit 0 — Zod `z.output` 統一 · 散在型修正 | [x] |
| FIX-A2 | CI `.github/workflows/validate.yml` に `tsc --noEmit` | [x] |
| FIX-A3 | `npm run weekly` + spec/README daily/weekly 対照表 | [x] |
| FIX-B1 | framework-assessment §9 — OS-10 / OS-10b 分離 · 実測採点 | [x] |
| FIX-B2 | steward-assessment.md 再評価 · ops p0 5 · 規程 14 | [x] |
| FIX-B3 | framework-executive-notes.md ギャップ 5 行 | [x] |
| FIX-B4 | 本 Phase L 登録 | [x] |
| FIX-C1 | ecommerce → production_ready + seed | [x] |
| FIX-C2 | cursor-only Skill 3 本 CLI 化 | [x] |
| FIX-C3 | SEC-P2-1 executive calendar CLI | [x] |

> REF-4b/c/d は L1（tsc ゲート）完了後に着手。SEC-P2-1 は L3 相当だが先行完了。

---

## Phase K — リファクタリング（2026-06-08）

全体評価に基づく安全性・簡潔性・拡張性の改善。

| ID | タスク | 状態 |
|----|--------|:----:|
| REF-0 | L2 個情 CSV untrack + サンプル化 · `.gitignore` records グローバル化 · `setTenantId` パストラバーサル硬化 · gitignore カバレッジ CI error 化 | [x] |
| REF-1 | `docs/spec.md` 正本統合 · 旧 spec を `spec/history/` へ · 正本ポインタ一括修正 · readiness 3 tier 同期 · Agent glossary · test 決定化（fileParallelism off） | [x] |
| REF-2 | dead code 削除 · JSONL 共通化（`jsonl-store.ts`） · `formatJapaneseDate`/registry loader 共通化 · 重複 CLI 削除 · `parseAsync` error handler · schema barrel（webhook 分離） | [x] |
| REF-3 | `writeTrackedFile` sanitize 統一 · `assertSafeTrackedPath` 書込 gate · `.cursorindexingignore` に records 追加 · registry 駆動 `classification boundaries` CLI | [x] |
| REF-4a | `module_contract.md` 形式化 + 契約 CI テスト | [x] |
| REF-4b | **テナント context lazy getter 化**（`DATA_DIR`/`DOCS_DIR` 等の import 時凍結を解消） | [x] |
| REF-4c | `cli.ts`（~1000 行）をドメイン別 registrar へ分割 | [x] |
| REF-4d | `finance.ts` 分割 · routing 命名整理 | [x] |
| REF-PRE | **前提:** `tsc --noEmit` エラー解消 + CI ゲート化 → REF-4b/c/d を安全に実施可能にする | [x] |

> REF-4b/c/d は大規模構造変更。クリーンな `tsc` ゲート（REF-PRE）確立後に、レビュー付きで実施することを推奨。

---

## Phase SEC — 秘書業務品質（2026-06-08）

Executive · Secretary 評価に基づく executive SoT 境界・運用品質。

| ID | タスク | 状態 |
|----|--------|:----:|
| SEC-P0-1 | correspondence-drafts / one-on-one-prep gitignore + index 削除 + example のみ追跡 | [x] |
| SEC-P0-2 | git-history-remediation — 段向け 3 案判断メモ · filter-repo チェックリスト · R-001 closed 条件（**実施は段承認待ち**） | [x] |
| SEC-P0-3 | executive バックアップ手順（REG-009 整合） | [x] |
| SEC-P0-4 | quickstart / 00-README / validate 警告（executive YAML 未作成） | [x] |
| SEC-P1-1 | secretary_behavior — Steward スレッド固定名 · 起動 1 行 | [x] |
| SEC-P1-2 | active_context — Secretary 読取面 | [x] |
| SEC-P1-3 | RES-STAKEHOLDERS から Executive 除外 | [x] |
| SEC-P1-4 | quickstart — Calendar 二重管理リスク 1 行 | [x] |
| SEC-P1-5 | secretary_escalation Step 5/6 固定 · relay 3 行 | [x] |
| SEC-P1-6 | secretary_behavior — ランウェイ relay 境界 | [x] |
| SEC-P2-1 | `steward executive calendar list` · `conflicts` · `brief` CLI | [x] |
| SEC-P2-2 | 配偶者・家族 — records/ vs STK consult サンプル（orchestrator） | [x] |
| SEC-P2-3 | tasks.yaml cancelled 整理方針（secretary_behavior 案） | [x] |
| SEC-P2-4 | Executive → Secretary リダイレクト 1 行テンプレ | [x] |

---

## Phase SEC-3 — 秘書品質 連続改善（2026-06-09 · 到達 4.5/5）

出口: ルール ≥4.5 · 実行時 ≥4.0 · **総合 ≥4.5** · 日常運用無条件 Yes

| ID | 内容 | Iter | 状態 |
|----|------|:----:|:----:|
| SEC3-0a | backup stamp 正本 `scratch/executive-backup-last.txt` 統一 | 0 | [x] |
| SEC3-0b | quickstart 初回 stamp 1 行 | 0 | [x] |
| SEC3-1 | `executive calendar push` · OAuth `.env` · idempotent · Meet | 1 | [x] |
| SEC3-2 | `secretary escalate` CLI + webhook · SEC2-2 Phase 1 | 1 | [x] |
| SEC3-3 | git-history-decision.md（段選択欄）· filter-repo IMP 起票 | 1 | [x] |
| SEC3-4 | `npm run weekly` backup ゲート（7 日超 exit 1） | 2 | [x] |
| SEC3-5 | filter-repo 実施（**段が案 A 選択時 · 人間**） | 2 | [ ] |
| SEC3-6 | Secretary 再評価レポート · 段アクション ≤2 | 2 | [x] |

---

## Phase SEC-4 — 秘書品質 4.9/5 連続改善（2026-06-09）

**出口:** 5 次元すべて **≥ 4.9** · 総合 **≥ 4.9** · 日常運用無条件 Yes · ゲート緑

| ID | 次元 | 内容 | Iter | 状態 |
|----|------|------|:----:|:----:|
| SEC4-0 | 全 | behavior/quickstart/backlog **矛盾監査 0 件** | 0 | [x] |
| SEC4-1 | 可用性 | 初回 backup 10 分 · ISO テンプレ · behavior 月曜報告ブロック | 0 | [x] |
| SEC4-2 | データ | 段向け git-history-decision **再依頼 1 ページ** | 0 | [x] |
| SEC4-3 | 予定 | calendar 未同期 validate warning · push 後ルール 3 行 | 1 | [x] |
| SEC4-4 | 予定 | OAuth refresh · `.env` セットアップ doc | 1 | [x] |
| SEC4-5 | 予定 | `calendar pull --since` 最小実装 | 1 | [x] |
| SEC4-6 | エスカレ | `secretary escalate --dispatch` + relay stdout | 1 | [x] |
| SEC4-7 | 応答 | tasks `archived` schema + CLI | 2 | [x] |
| SEC4-8 | 応答 | daily/weekly brief 統合 | 2 | [x] |
| SEC4-9 | 可用性 | 月曜リマインド（launchd テンプレ · **段が load 要**） | 2 | [ ] |
| SEC4-10 | 可用性 | 四半期リストア演習 doc + ISO 行 | 2 | [x] |
| SEC4-11 | データ | filter-repo 実施（**段が案 A 選択時**） | 2 | [ ] |
| SEC4-12 | 全 | **5 次元再評価** · 未達次元の追加 IMP | 各 Iter 末尾 | [ ] |

---

## Phase SEC-GAP — 実行時ギャップ一括（2026-06-09）

秘書自己評価 3.5/5 → 実行開始可能。**5 項目**の Phase 0（文書）/ Phase 1（設計）/ 実装の整理。

| # | 項目 | Phase 0 | Phase 1 | 状態 |
|---|------|---------|---------|:----:|
| 1 | Git 履歴 R-001 | [git-history-remediation.md](../tenants/mal/docs/compliance/privacy/git-history-remediation.md) 3 案 · 段承認待ち | filter-repo 実行 | mitigated |
| 2 | エスカレ手動 | secretary_behavior コピー 1 ブロック · quickstart ピン留め | SEC2-2 自動 POST | [x]/[ ] |
| 3 | Calendar 二重管理 | 暫定 3 行 · CLI list/conflicts | SEC2-CAL push | [x]/[ ] |
| 4 | バックアップ | 月曜週次 3 行 · integrity 7 日 warning | — | [x] |
| 5 | executive CLI | SEC-P2-1 list · conflicts · brief | brief 拡張 | [x] |

---

## Phase SEC-2 — 秘書 Phase 1 候補（計画 · 実装スコープ外）

| ID | 内容 | 状態 |
|----|------|:----:|
| SEC2-CAL | **Google Calendar push** — `steward executive calendar push` · SEC3-1 実装済 | [x] |
| SEC2-1 | SEC2-CAL と同一（旧 ID · 参照互換） | [x] |
| SEC2-2 | **エスカレ自動中継** — `secretary escalate` CLI + webhook · 完全自動 POST は Phase 2 | [x] |
| SEC2-3 | **tasks `archived` ステータス** — schema + 移行 · SEC4-7 実装済 | [x] |

---

## Phase J — v0.8 Cloud Agent · Webhook · PR（Phase 3）

| ID | タスク | 状態 |
|----|--------|:----:|
| OS-100-J1 | webhook serve (inbound HTTP) | [x] |
| OS-100-J2 | agent cloud config/watch + dispatch --runtime cloud | [x] |
| OS-100-J3 | merge pr plan/create | [x] |
| OS-100-J4 | queue processor (shared drain) | [x] |
| OS-100-J5 | spec-v0.8 · tests/phase3.test.ts | [x] |

---

## Phase I — v0.7 Agent 自動化（Phase 2）

| ID | タスク | 状態 |
|----|--------|:----:|
| OS-100-I1 | agent dispatch plan/run | [x] |
| OS-100-I2 | queue DB (JSONL) + drain | [x] |
| OS-100-I3 | webhook registry · send/ingest | [x] |
| OS-100-I4 | escalate merge + auto-merge | [x] |
| OS-100-I5 | spec-v0.7 · tests/phase2.test.ts | [x] |

---

## Phase E — v0.6 文書 · 監査骨格

| ID | タスク | 状態 |
|----|--------|:----:|
| OS-100-E1 | spec-v0.6 · assessment §9 | [x] |
| OS-100-E2 | audit log CLI + hooks | [x] |

## Phase F — production_ready · Skill CLI

| ID | タスク | 状態 |
|----|--------|:----:|
| OS-100-F1 | production_ready ×5（+ ps · saas · restaurant） | [x] |
| OS-100-F2 | Skill cli ≥12（dashboard · forecast · revpar · schedule · one-on-one） | [x] |

## Phase G — コンプライアンス · パイプライン

| ID | タスク | 状態 |
|----|--------|:----:|
| OS-100-G1 | `steward compliance gap` | [x] |
| OS-100-G2 | `pipeline run weekly` + routing-queue サマリ | [x] |

## Phase H — 100% クローズ

| ID | タスク | 状態 |
|----|--------|:----:|
| OS-100-H1 | framework-assessment §9 = 100% | [x] |
| OS-100-H2 | tests · npm run check green | [x] |

---

## Definition of Done（OS-100）

| ID | 完了定義 | 確認 |
|----|---------|------|
| **OS-1** | spec.md（OS-100 章 · v0.6 履歴） | ファイル存在 |
| **OS-2** | framework-assessment §9 | DoD 表 |
| **OS-3** | Phase E–H 全 [x] | 本ファイル |
| **OS-4** | production_ready ≥ 5 | modules check --all |
| **OS-5** | invoice seed × production_ready | manifests |
| **OS-6** | cli skills ≥ 12 | skills list |
| **OS-7** | audit log | audit log list |
| **OS-8** | compliance gap | compliance gap |
| **OS-9** | pipeline weekly | pipeline run weekly |
| **OS-10** | acme ops p0 = 0 | ops p0 --tenant acme |

---

## 先行フェーズ（完了）

### Phase D — L3 v0.5 · SKEL-100

[framework-backlog 履歴](framework-backlog.md) — SKEL-100-D1〜D7 · D1–D10 骨格 v2 100%（2026-06-09 コミット 347b34b）

---

## スコープ外（Phase 4+）

- MAL 実手続 · secrets 実値
- 本番 webhook 常駐デプロイ（systemd / k8s）

---

## 作業ログ

| 日付 | ID | 摘要 |
|------|-----|------|
| 2026-06-08 | J1–J5 | Phase 3 — webhook serve · cloud watch · merge pr |
| 2026-06-09 | I1–I5 | Phase 2 — dispatch · queue · webhook · merge |
| 2026-06-09 | E–H | OS-100 — audit · gap · weekly · 5× production_ready · 12 CLI skills |
