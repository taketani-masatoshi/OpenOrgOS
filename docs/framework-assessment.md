# Steward OS — フレームワーク完成度評価

**スコープ:** リポジトリの **フレームワーク層**（`src/` · `schemas/` · `steward/` · `docs/spec*`）。  
**スコープ外:** 特定法人の規程件数 · 契約 ID · 物件名 · P0 残タスク → 各テナント `docs/compliance/iso/steward-assessment.md`

**仕様正本:** [spec.md](spec.md) · [framework-backlog.md](framework-backlog.md)

---

## 1. 評価の使い分け

| 評価対象 | 文書 | 例 |
|---------|------|-----|
| フレームワーク製品 | **本書** | CLI 網羅 · スキーマ · モジュール tier |
| テナントインスタンス | `tenants/{id}/docs/.../steward-assessment.md` | 当該法人の REG/契約/P0 |

---

## 2. フレームワーク次元（5 領域）

| 領域 | 観点 | 確認方法 |
|------|------|---------|
| **Core CLI** | validate · status · dashboard · deps | `npm test` · `npm run validate` |
| **テナント分離** | `--tenant` · modules/standards/regulations · ops-config | 複数テナントで validate |
| **業務モジュール** | catalog · readiness tier · seed · billing | `steward modules list` |
| **Skills / Ops** | skills run * · ops p0/daily | `steward skills list` |
| **仕様 · 文書** | spec-v0.3 · サブ spec · assessment 分離 | 本リポジトリ `docs/` |
| **法域 · 言語** | TJS-11 pack · display_language registry | [org-os/tjs-11-target-jurisdictions.md](org-os/tjs-11-target-jurisdictions.md) |

### 完成度レベル（目安）

| レベル | 定義 |
|--------|------|
| **L1 雛形** | スキーマ + 最小 CLI。seed_only モジュールのみ |
| **L2 接続可能** | テナント雛形 · modules.yaml バインド · validate 通過 |
| **L3 運用可能** | production_ready モジュール · Skills · P0/invoice 一般化 |
| **L4 拡張安定** | テスト網羅 · 破壊的変更のアダプタ · spec バージョン管理 |

---

## 3. 業務モジュール tier ルーブリック

正本: [steward/modules/readiness.yaml](../steward/modules/readiness.yaml)

| チェック | production_ready | seed_only |
|---------|:----------------:|:---------:|
| `steward/modules/{id}/agent.md` | 必須 | 必須 |
| `seed/` 雛形 | 運用に必要な一式 | 最小 example のみ |
| 専用 CLI / billing 連携 | あればテナント `modules.yaml` で設定 | 未実装可 |
| テナント validate | 代表テナントでエラー 0 が目標 | 有効化前に seed コピー必須 |

---

## 4. テナント成熟度（三次元）

テナント `steward status` のスコア定義。実装: `src/lib/maturity.ts` · 入力: テナント `data/` + `ops-config.yaml`。

| 次元 | 定義 | 主な CLI |
|------|------|---------|
| **準備度** | リポジトリ · **有効規程カタログ** · 予実 · 契約台帳の整備 | `validate` · `status` |
| **運用度** | **ops-config 定義の P0** · 月次実績 · operations 記録/secrets | `ops p0` |
| **自動化度** | classification · document-io · integrity · daily 系 | `skills run daily` |

**注意:** 準備度の規程スコアは「有効規程数 / 期待カタログ数」の比率で算出。期待数はテナントの `regulations.yaml` 次第であり、フレームワーク文書に固定件数（例: 16 件）を書かない。

**スケルトンモード:** `tenant.yaml` の `lifecycle: skeleton` または `ops-config.yaml` の `skeleton: true` のテナントでは、運用度は **N/A（—）** とし、P0 ブロッカー・secrets 未作成警告を抑制する。`steward status` の総合スコアは準備度+自動化度の平均。スケルトン評価 ≠ 運用テナント（mal 等）の成熟度。

### 骨格評価 ≠ 運用度

`tenant.yaml` の `lifecycle: skeleton`（または `ops-config.yaml` の `skeleton: true`）では、P0 ブロッカー · secrets 未作成 · cash-balance 未確定を **警告に留め**、運用度は `N/A` または低スコア表示とする。骨格テナント（`tenants/demo/`）の validate 通過は **準備度** の目安であり、運用就绪を意味しない。

### テナント水準（インスタンス側の目安）

| 水準 | 準備度 | 運用度 | 自動化度 |
|------|--------|--------|---------|
| **準備完了** | validate OK · 計画 12 ヶ月 | P0 ブロッカー残 | daily 実行可 |
| **運用就绪** | 同上 | P0 解消 · records 開始 | 同上 |
| **確定** | 同上 | 月次 confirmed · 監査記録 | deps 鮮度 OK |

---

## 5. Skills カバレッジ

| Skill CLI | フレームワーク要件 |
|-----------|-------------------|
| `contract-expiry` | 契約スキーマ · alerts |
| `permit-expiry` | 許認可 · 保険 draft 検知（テナント契約データ） |
| `monthly-close` | monthly finance スキーマ |
| `variance` | yojitsu v2 lines[] · business-plan segments |
| `records-check` | ops-config records プローブ |
| `p0` | ops-config P0 契約/secrets/records |
| `daily` | maturity + p0 + alerts 合成 |

---

## 6. 定期見直し

| 頻度 | アクション |
|------|-----------|
| フレームワーク PR | `npm test` · spec バージョン更新 |
| テナント四半期 | 当該 `steward-assessment.md` 更新 |
| メジャー機能 | spec-v0.x 新設 · サブ spec 追加 |

---

## 7. 骨格 v2 達成度（フレームワーク · 2026-06）

**総合: 100%（L2+ 骨格 v2 完成）** — DoD D1–D10 すべて ✓。タスク正本: [framework-backlog.md](framework-backlog.md)

| DoD | 定義 | 状態 | 確認 |
|-----|------|:----:|------|
| D1 | framework-backlog · DoD 表 | ✓ | `tests/framework-backlog.test.ts` |
| D2 | `npm run check` 統合 | ✓ | CI · `package.json` |
| D3 | `tenants/acme/` validate | ✓ | `tests/acme-validate.test.ts` |
| D4 | demo + acme 双参照 | ✓ | `tests/demo-status.test.ts` · acme status |
| D5 | `_template` classification · executive example | ✓ | `classification check` |
| D6 | `tenant init` example コピー | ✓ | `tests/skeleton.test.ts` |
| D7 | spec（骨格 v2 章） | ✓ | [spec.md](spec.md) |
| D8 | `steward map list` · `resolve` | ✓ | `tests/map.test.ts` |
| D9 | 全 module seed/00-README · restaurant 骨格 seed | ✓ | `modules check --all` · `modules check restaurant` |
| D10 | 本 § = 100% | ✓ | 本表 |

| チェック | 状態 | 確認 |
|---------|:----:|------|
| `steward tenant init` + `regulations seed` | ✓ | `npm test` · `tests/skeleton.test.ts` |
| `steward modules check --all` | ✓ | `npm run check` |
| demo · acme 骨格 validate | ✓ | `npm run check` |
| yojitsu v2 · invoice generate · dashboard モジュール駆動 | ✓ | v0.3 維持 |
| executive gitignore + example パターン | ✓ | `.gitignore` · RES-EXEC-* |
| テスト | ✓ | `npm test` 全 pass |

### v3 以降（スコープ外）

| 項目 | 備考 |
|------|------|
| Cursor 外 Skill パイプライン | inbox → validate → dashboard |
| production_ready 全モジュール billing | rental 以外 |
| MAL 実データ Git 外化（finance/contracts 全体） | 別 Epic |

---

## 9. 製品ルーブリック（OS-100 · 2026-06-09 再評価）

**製品 DoD（OS-1〜OS-10）:** acme / demo 骨格 — **100/100（実測 · 2026-06-25）**  
**運用テナント DoD（OS-10b）:** `mal` — **未達（ops p0 ブロッカー 5）** — 人間完遂後 100  
正本: [spec.md](spec.md) · [framework-backlog.md](framework-backlog.md) Phase L

| 観点 | 配点 | 実測 | 計測根拠 |
|------|:----:|:----:|---------|
| **汎用性** | 25 | **25** | production_ready ≥5 · acme/demo validate ✓ |
| **拡張性** | 25 | **25** | `npx tsc --noEmit` exit 0 · audit · routing/escalate |
| **完全性（監査）** | 25 | **25** | classification · audit trail · compliance gap ✓ |
| **自動化** | 25 | **25** | `npm run daily`/`weekly` ✓ · REF-4b/d 完了 |

> 旧版は四観点すべて 25/25 と自己宣告していたが、**tsc 71 エラー** と **npm run weekly 未登録** により実測は **90/100** 相当だった（FIX-A1〜A3 で回復）。

### 製品 DoD — OS-1〜OS-10（acme 骨格）

| DoD | 定義 | 状態 | 確認 |
|-----|------|:----:|------|
| OS-1 | spec（OS-100 章） | ✓ | [spec.md](spec.md) |
| OS-2 | 本 §9 実測採点 | ✓ | 本表 |
| OS-3 | backlog Phase L [x] | ✓ | framework-backlog.test |
| OS-4 | production_ready ≥5 | ✓ | `modules check --all` |
| OS-5 | invoice/billing seed | ✓ | module manifests |
| OS-6 | cli ≥12/17 | ✓ | `steward skills list` |
| OS-7 | audit log | ✓ | `steward audit log list` |
| OS-8 | compliance gap | ✓ | `steward compliance gap` |
| OS-9 | pipeline weekly | ✓ | `npm run weekly` |
| OS-10 | ops p0 0（**acme**） | ✓ | `--tenant acme ops p0` |

### 運用テナント DoD — OS-10b（mal · 人間完遂）

| DoD | 定義 | 状態 | 確認 |
|-----|------|:----:|------|
| OS-10b | ops p0 ブロッカー 0（**mal**） | **未達** | `--tenant mal ops p0` → **5 件** |

| ブロッカー ID | 状態 | 備考 |
|--------------|:----:|------|
| CTR-013 | draft | 手続完了待ち |
| CTR-014 | draft | 手続完了待ち |
| CTR-012 | executed | 本社オフィス賃貸 · サウスウッド |
| secrets-kamezawa | 未作成 | example からコピー |
| cash-balance | template | status: confirmed 待ち |

**テナント MAL 詳細:** [steward-assessment.md](../tenants/mal/docs/compliance/iso/steward-assessment.md) — フレームワーク 98% ≠ テナント運用 100%。

---

## 10. 会社 OS 総合（OS-99+ Epic · 2026-06-09）

**目的:** 製品層と MAL 運用層を **1 点数** に統合し、99+ 達成まで連続改善する。

### 採点式（実装: `src/lib/os-score.ts` · `steward status --os-99`）

| 成分 | 重み | データ源 |
|------|:----:|---------|
| 製品（§9 実測） | **30%** | `PRODUCT_FRAMEWORK_SCORE`（**100**） |
| MAL 準備度 | **25%** | `steward status` 準備度 |
| MAL 運用度 | **35%** | `steward status` 運用度 · **ops p0 が最大ギャップ** |
| MAL 自動化度 | **10%** | `steward status` 自動化度 |

**総合** = 加重平均（四捨五入） · **出口: composite ≥ 99**

### サイクル（止めるまで回す）

1. `npm run steward -- status --os-99` — 採点
2. `ops p0` — ブロッカー特定
3. 最大ギャップ → `escalate run`（製品）/ [p0-closing-register.md](../tenants/mal/docs/company/p0-closing-register.md)（人間）
4. assessment · executive-notes 更新
5. composite < 99 → 次サイクル

### 2026-06-09 実測ベースライン（Cycle 0 → 1）

| 層 | Cycle 0 | Cycle 1 |
|----|:-------:|:-------:|
| 製品 | 98 | **99**（REF-4c cli registrar） |
| MAL 準備 / 運用 / 自動 | status 実測 | 同左（運用 **84%** がボトルネック） |
| **会社 OS 総合** | 93 | **`status --os-99` 参照**（製品 +1 · 加重 0.3 → 丸め後 93） |
| **99+ まで** | 6 点 | P0 5 件解消が主経路 |

---

## 11. TJS-11 三軸評価（法域 · 言語 · 業務）

**正本:** [org-os/tjs-11-target-jurisdictions.md](org-os/tjs-11-target-jurisdictions.md)

275 法域を分母にしない。製品完成度は **TJS-11**（目標法域 11 バケット）と **表示言語レジストリ**、**業務モジュール tier** の三軸で報告する。

| 軸 | 分母 | 定義 | 確認 |
|----|------|------|------|
| **法域 pack** | TJS-11 | 各バケットが pack_ready DoD 達成 | `jurisdiction packs check` · demo validate |
| **表示言語** | TJS 必須 `display_language` | `steward/locale/registry.yaml` | `steward locale list` |
| **業務 module** | カタログ 27 | `production_ready` 件数 | `modules check --all` · [readiness.yaml](../steward/modules/readiness.yaml) |

### 2026-06 ベースライン

| 軸 | 分子 | 分母 | 率 |
|----|:----:|:----:|:--:|
| 法域 pack（TJS-11） | 11 | 11 | **100%** |
| 表示言語 | 9 | 9 | **100%** |
| 業務 production_ready | 24 | 27 | **89%** |

達成 pack: **JP** · **US** · **SG** · **HK** · **AU** · **TW** · **MY** · **CN** · **AE** · **RU** · **EU**（TJS-EU 案 A）。  
TJS-11 法域: **11/11 完了**（2026-06-25）。

**体感完成度** = 三軸の最小値（現状 **89%** — 業務 module 軸）— チケット: [framework-backlog-tickets-bc.md](framework-backlog-tickets-bc.md)

---

## 12. Inter-org Protocol（OpenOrgOS Core wire）

**正本:** [org-os/inter-org-operator-model.md](org-os/inter-org-operator-model.md) · デモ: `npm run demo:inter-org`

| 次元 | 評価 | 根拠 |
|------|------|------|
| 設計思想（Steward 非送信 · 人間 approve） | **高** | outbound ガード · notice 統一ワークフロー |
| 2 Org デモ E2E | **高** | mal ↔ southwood · execution notice + ack |
| Transport | **良** | HTTP webhook · `protocol deliver` · **`protocol deliver-pull`** · inbox mirror |
| 信頼（Ed25519 · strict verify） | **良** | 署名 · peer `protocol_public_key` · ingest 拒否 |
| REG-004 | **良** | 法域別閾値 YAML · `company.yaml` 役員照合 |
| Agent UX | **良** | `protocol notice draft` · Secretary Skill |
| Witness Hub | **良** | 分散プール · fan-out · quorum · `hub serve` |
| 法域一般化 | **良** | JP/HK/US 閾値 · tenant `jurisdiction` 連動 |

確認: `npm test -- protocol` · `steward protocol validate` · `steward protocol approvers`

---

## 13. OrgOS 完成度（C1–C3）

**正本:** [org-os/orgos-completion-plan.md](org-os/orgos-completion-plan.md) · 実行: [framework-backlog.md](framework-backlog.md) Phase ORG-C · 運用: [runbook-orgos.md](runbook-orgos.md)  
**Org 根幹（P0–P5）:** [org-approval-schema.md](org-os/org-approval-schema.md) §12–19 · **~95/100**（2026-06-27 · **459 tests**）

| 軸 | 重み | 現状 | 根拠 |
|----|------|:----:|------|
| 単独閉ループ（C1） | 35% | **95%** | [demo:standalone-org](../package.json) · internal approve · [standalone-org-demo.test.ts](../tests/standalone-org-demo.test.ts) · `protocol validate --standalone` |
| 形式統一 | 25% | **90%** | witness emit → audit chain · [protocol-witness-integration.test.ts](../tests/protocol-witness-integration.test.ts) |
| インターフェース（C2） | 15% | **85%** | module production_ready **89%** ≥ 88% 閾値 · `jp_corporate_registration` 昇格 |
| Wire 証拠 | 15% | **88%** | inter-org demo · deliver-pull · **mesh deliver E2E** · hub verify remote |
| エコシステム（Community） | 10% | **45%** | [C4 backlog](org-os/c4-community-backlog.md) 据置 |

**OrgOS 完成度（加重）:** **86/100**（`npm run steward -- status --orgos` · 2026-06-27）

> **注:** Eco 45% 据置。IF 85% · module 89% で加重 **~86/100**。

```bash
npm run steward -- status --orgos
npm run demo:standalone-org
npm run demo:inter-org
npm run demo:deliver-pull
npm run demo:mesh-deliver
```

P0–P5 で Org 承認根幹完了。ORG-C1–C3/C5 で standalone デモ · witness E2E · module promotion · runbook · mesh v1 を完了。[C4 Community backlog](org-os/c4-community-backlog.md) は据置。

---

## 8. 関連

- [org-os/tjs-11-target-jurisdictions.md](org-os/tjs-11-target-jurisdictions.md)
- [framework-backlog.md](framework-backlog.md)
- [spec.md](spec.md)（仕様正本）
- [spec/history/](spec/history/)（旧版）
- [spec/yojitsu-v2.md](spec/yojitsu-v2.md)
- [spec/invoice.md](spec/invoice.md)
- テナント評価例: [tenants/mal/docs/compliance/iso/steward-assessment.md](../tenants/mal/docs/compliance/iso/steward-assessment.md)
