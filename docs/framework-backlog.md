# Steward OS — フレームワーク骨格バックログ（SKEL-100）

**正本:** [framework-assessment.md](framework-assessment.md) §7 · [spec-v0.4.md](spec-v0.4.md)  
**品質ゲート:** `npm run check && npm test`  
**ブロッカー報告:** [framework-executive-notes.md](framework-executive-notes.md)（5 行以内）

**状態: 骨格 v2 100% · L3 v0.5 着手（2026-06-09）**

## Phase D — L3 製品深度（v0.5）

| ID | タスク | 状態 |
|----|--------|:----:|
| SKEL-100-D1 | readiness 3 tier · modules check | [x] |
| SKEL-100-D2 | hospitality billing parity | [x] |
| SKEL-100-D3 | 13 activation_ready seeds | [x] |
| SKEL-100-D4 | Skill registry · skills list | [x] |
| SKEL-100-D5 | pipeline run daily | [x] |
| SKEL-100-D6 | npm run daily = check + pipeline | [x] |
| SKEL-100-D7 | map tree · spec-v0.5 | [x] |

---

## Definition of Done（骨格 v2 · 100%）

| ID | 完了定義 | 確認 |
|----|---------|------|
| **D1** | 本ファイル + DoD 表 + 進捗 [x] 管理 | `tests/framework-backlog.test.ts` |
| **D2** | `npm run check` = validate · demo · acme · modules --all · classification | CI · `package.json` |
| **D3** | 第 3 テナント `tenants/acme/` · validate 通過 | `tests/acme-validate.test.ts` |
| **D4** | `tenants/demo/` + `acme/` 双参照（MAL 非依存パス） | demo-status · acme status |
| **D5** | `_template` classification-registry · executive example 骨格 | classification check |
| **D6** | `tenant init` が `*.yaml.example` をコピー | skeleton.test |
| **D7** | `spec-v0.4.md` 骨格 v2 100% 正本 | ファイル存在 |
| **D8** | `steward map list` 論理→物理パス | `tests/map.test.ts` |
| **D9** | 全 catalog module seed 骨格 · restaurant menu/tables | modules check |
| **D10** | framework-assessment §7 = **100%** | DoD 全 ✓ |

---

## Phase A — 基盤 · 第 3 テナント

| ID | タスク | 状態 |
|----|--------|:----:|
| SKEL-100-A1 | framework-backlog.md · DoD · framework-executive-notes · テスト | [x] |
| SKEL-100-A2 | `tenants/acme/` 参照テナント · validate テスト · check 統合 | [x] |
| SKEL-100-A3 | `_template` classification-registry（RES-EXEC-* · gitignore 整合） | [x] |
| SKEL-100-A4 | `tenant init` — `.yaml.example` コピー · cpSync フィルタ修正 | [x] |
| SKEL-100-A5 | `spec-v0.4.md` 骨格 v2 100% changelog | [x] |

## Phase B — CLI · seed 骨格

| ID | タスク | 状態 |
|----|--------|:----:|
| SKEL-100-B1 | `steward map list` · `steward map resolve <path>` | [x] |
| SKEL-100-B2 | restaurant `menu.yaml` · `tables.yaml` 骨格 seed | [x] |

## Phase C — 100% クローズ

| ID | タスク | 状態 |
|----|--------|:----:|
| SKEL-100-C1 | framework-assessment §7 → 100% v2 · L3 残差整理 | [x] |
| SKEL-100-C2 | README · tenants/00-README · CI acme validate | [x] |

---

## スコープ外（v3 以降）

- MAL 実データ · P0 手続 · secrets 実値 · cash-balance 実数
- Cursor 外 Skill パイプライン
- production_ready 全モジュール billing 拡張（rental 以外）

---

## 作業ログ

| 日付 | ID | 摘要 |
|------|-----|------|
| 2026-06-09 | A1–C2 | 骨格 v2 100% — acme · map · spec-v0.4 · tenant init · restaurant seed |
