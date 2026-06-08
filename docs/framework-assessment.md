# Steward OS — フレームワーク完成度評価

**スコープ:** リポジトリの **フレームワーク層**（`src/` · `schemas/` · `steward/` · `docs/spec*`）。  
**スコープ外:** 特定法人の規程件数 · 契約 ID · 物件名 · P0 残タスク → 各テナント `docs/compliance/iso/steward-assessment.md`

**仕様正本:** [spec-v0.3.md](spec-v0.3.md)

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

## 7. 関連

- [spec-v0.3.md](spec-v0.3.md)
- [spec/yojitsu-v2.md](spec/yojitsu-v2.md)
- [spec/invoice.md](spec/invoice.md)
- テナント評価例: [tenants/mal/docs/compliance/iso/steward-assessment.md](../tenants/mal/docs/compliance/iso/steward-assessment.md)
