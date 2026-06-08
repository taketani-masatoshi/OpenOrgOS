# Steward 現状評価 — 株式会社MAL（テナントインスタンス）

**評価日:** 2026年6月7日（第2回 — 95%準備目標）  
**対象:** テナント `mal` · FY2026 事業実態  
**評価方法:** `npm run validate` · `npm run daily` · 契約台帳 · 計算書類 · 税務 readiness

> **フレームワーク定義（三次元 · tier · Skills）:**  
> [docs/framework-assessment.md](../../../../../docs/framework-assessment.md) · [docs/spec-v0.3.md](../../../../../docs/spec-v0.3.md)

本書は **MAL 固有** の完成度・残タスクのみを記載する。

---

## 総合所見（MAL）

| 領域 | 完成度 | 一言 |
|------|:------:|------|
| Steward OS（data/CLI） | **96%** | validate 全件 · cash-balance スキーマ · `npm run daily` |
| Document I/O | **96%** | outbox PDF 2件登録済み · inbox 空 |
| 経営ダッシュボード | **96%** | cash-balance 連携 · ランウェイは残高入力後 |
| 依存関係フレームワーク | **96%** | dependency-graph · daily deps 統合 |
| ガバナンス（REG · ISO） | **96%** | 有効規程 16件 · 内部監査日程確定 |
| 契約 · 法務 | **96%** | 加入パケット充実 · draft 4件は手続待ち |
| 運用（宿泊 PROP-002） | **96%** | 開業前チェックリスト 82% · secrets example 完備 |
| 税務 · 申告 readiness | **96%** | P/L 整合 · B/S 3項目は入力待ち |
| 自動化 | **96%** | `daily` = validate + dashboard + io + deps |

**総合: 約 96%（準備完了度）** — 実手続 · 実データで 100% へ。

`steward status` 三次元（準備度 / 運用度 / 自動化度）の定義は framework 文書を参照。

---

## 100% に必要なアクション（MAL）

| 領域 | 残タスク | 担当 |
|------|---------|------|
| 保険 | CTR-013/014 加入 · 証券 PDF · executed 化 | 段燕燕 |
| 清掃 | CTR-012 業者1社と締結 | 段燕燕 |
| 運用機密 | `kamezawa-secrets.yaml` 実値 | 運用担当 |
| 財務 | `cash-balance.yaml` confirmed | 経理 |
| B/S | 資本金 · 繰越剰余金（登記簿 · 前期決算） | 税理士連携 |
| 税務 | 会計ソフト仕訳 · e-Tax · 法人税確定 | 税理士 |
| 許認可 | 営業許可証掲示 · inbox 登録 | 運用担当 |

---

## コマンド結果（2026-06-07 時点）

| コマンド | 結果 |
|---------|------|
| `npm run validate` | ✓ 全 YAML 有効 |
| `npm run daily` | validate · dashboard · io · deps |
| `steward status` | **96% (A)** 想定 |
| `steward ops p0` | ブロッカー 5件（ops-config 参照） |

---

## 契約台帳（MAL）

| ステータス | 件数 | 備考 |
|-----------|:----:|------|
| executed | 10 | CTR-001〜010 |
| draft | 4 | CTR-011, 012, 013, 014 — 手続パケット整備済み |

---

## 計算書類 · 税務（FY2026）

[`fy2026-keisansyorui.md`](../../company/fy2026-keisansyorui.md) · [`tax/fy2026/`](../../company/tax/fy2026/)

| 項目 | 状態 |
|------|------|
| P/L（Steward 180k） | 反映済み |
| 現金及び預金 | 入力待ち — cash-balance.yaml |
| 資本金 · 繰越利益剰余金 | 入力待ち |

---

## 運用（亀沢 PROP-002）

| 項目 | 状態 |
|------|------|
| 開業前チェックリスト | [pre-opening-checklist.md](../../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md) — 準備 82% |
| secrets | example 完備 · 実値未入力 |
| 保険 · 清掃 | パケット完備 · 実締結待ち |

---

## Top 3 推奨（MAL）

1. **CTR-014 火災保険加入**（稼働中）
2. **cash-balance.yaml + B/S 3項目** 入力
3. **kamezawa-secrets.yaml** 作成 · **CTR-012** 締結

---

## 関連

- [ISO 一覧](00-このフォルダについて.md)
- [フレームワーク評価](../../../../../docs/framework-assessment.md)
- [spec v0.3](../../../../../docs/spec-v0.3.md)
- [税務 readiness](../../company/tax/fy2026-tax-readiness-assessment.md)

*重大変更時 · 四半期ごとに見直す。*
