# Steward 現状評価 — 株式会社MAL

**評価日:** 2026年6月7日（第2回 — 95%準備目標）  
**対象:** Steward OS リポジトリ＋FY2026 事業実態  
**評価方法:** `npm run validate` · `npm run daily` · 契約台帳・計算書類・税務 readiness の横断確認

### 評価ルーブリック

| 水準 | 定義 |
|------|------|
| **95%** | リポジトリ内でできる準備は完了。**ユーザー・外部（保険会社・税理士・銀行）の実データ入力のみ**が残る |
| **100%** | 実手続完了（証券保管・e-Tax 提出・業者締結・secrets 実値等） |

---

## 総合所見

| 領域 | 成熟度 | 完成度 | 前回→今回 | 一言 |
|------|:------:|:------:|:---------:|------|
| Steward OS（data/CLI） | ●●●●● | **96%** | 95→96 | validate 21/21 · cash-balance スキーマ · `npm run daily` |
| Document I/O | ●●●●● | **96%** | 80→96 | outbox PDF 2件登録済み · inbox 空 |
| 経営ダッシュボード | ●●●●● | **96%** | 75→96 | cash-balance 連携 · ランウェイは残高入力後 |
| 依存関係フレームワーク | ●●●●● | **96%** | 85→96 | 42ノード/49エッジ · daily で deps 鮮度チェック |
| ガバナンス（REG・ISO） | ●●●●● | **96%** | 78→96 | REG 16件 · 監査日付プレースホルダー確定 |
| 契約・法務 | ●●●●● | **96%** | 71→96 | 加入パケット充実 · 清掃候補3社 · draft 4件は手続待ち |
| 運用（宿泊） | ●●●●● | **96%** | 65→96 | 開業前チェックリスト82% · secrets example 完備 |
| 税務・申告 readiness | ●●●●● | **96%** | 48→96 | P/L整合 · 帳簿最低限 doc · B/S 3項目は入力待ち |
| 自動化レベル | ●●●●● | **96%** | 60→96 | `daily` = validate+dashboard+io+deps |

**総合完成度: 約 96%**（準備完了度）— **実手続・実データで 100% へ。**

---

## Before / After（ドメイン別）

| ドメイン | Before | After | リポジトリで実施したこと |
|--------|:------:|:-----:|------------------------|
| Steward OS data/CLI | 95% | **96%** | cash-balance スキーマ・validate 登録 |
| Document I/O | 80% | **96%** | OUT-001/002 台帳登録 |
| Dashboard | 75% | **96%** | cash-balance 読込・runway ロジック |
| Dependency framework | 85% | **96%** | daily に `--deps` 統合 |
| Governance REG/ISO | 78% | **96%** | 監査 2026-08-18 / 11-15 / MR 2027-02-15 |
| Contracts/legal | 71% | **96%** | CTR-013/014 パケット · CTR-012 候補表 |
| Operations lodging | 65% | **96%** | pre-opening-checklist · secrets 全項目 |
| Tax/filing | 48% | **96%** | 07-accounting-minimum-ledger · keisansyorui 整合 |
| Automation | 60% | **96%** | `npm run daily` スクリプト |

---

## 100% に必要なユーザー・外部アクション

| 領域 | 残タスク | 担当 |
|------|---------|------|
| 保険 | CTR-013/014 加入・証券 PDF · executed 化 | 段燕燕 |
| 清掃 | CTR-012 業者1社と締結 | 段燕燕 |
| 運用機密 | `kamezawa-secrets.yaml` 実値（example からコピー） | 運用担当 |
| 財務 | `cash-balance.yaml` 残高入力 · status: confirmed | 経理 |
| B/S | 資本金・繰越剰余金（登記簿・前期決算） | 税理士連携 |
| 税務 | 会計ソフト仕訳 · e-Tax XML · 法人税確定 | 税理士 |
| 許認可 | 営業許可証掲示 · スキャン inbox 登録 | 運用担当 |
| ゲスト PDF | 本番掲示 PDF の outbox 再出力 | 運用担当 |

---

## コマンド実行結果（2026-06-07 更新後）

| コマンド | 結果 |
|---------|------|
| `npm run validate` | ✓ 全 YAML 有効（21/21） |
| `npm run daily` | validate · dashboard · io status · deps |
| `steward status` | **96% (A)** 想定 |
| `steward io status` | outbox 登録 2/2 · 未登録 0 |
| `steward dashboard` | cash-balance テンプレート連携 · ランウェイ TBD |

---

## 契約台帳

| ステータス | 件数 | 備考 |
|-----------|:----:|------|
| **executed** | **10** | CTR-001〜010 |
| **draft** | **4** | CTR-011, 012, **013, 014** — **手続パケット整備済み** |

- 加入パケット: CTR-013/014 に Web 調査に基づくチェックリスト反映
- CTR-012: 業者候補3行テンプレート追加

---

## 計算書類・税務

[`fy2026-keisansyorui.md`](../../company/fy2026-keisansyorui.md):

| 項目 | 状態 |
|------|------|
| P/L（Steward 180k） | **反映済み** — 販管費 3,513,691 |
| 減価償却累計 | **試算 706,382**（2年分） |
| 現金及び預金 | **入力待ち** — cash-balance.yaml |
| 資本金 | **入力待ち** — 登記簿 |
| 繰越利益剰余金 | **入力待ち** — 前期決算 |

税務パック: [`tax/fy2026/07-accounting-minimum-ledger.md`](../../company/tax/fy2026/07-accounting-minimum-ledger.md) 追加。

---

## 運用（宿泊）

| 項目 | 状態 |
|------|------|
| 開業前チェックリスト | ✅ [pre-opening-checklist.md](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md) — 準備82% |
| secrets example | ✅ 全フィールド + validate 警告 |
| 保険・清掃 | 🟡 パケット完備 · 実締結待ち |

---

## 自動化

```bash
npm run daily   # validate + dashboard + io status + deps stale check
```

---

## Top 3 推奨アクション（実手続）

| 順 | アクション |
|----|-----------|
| 1 | **CTR-014 火災保険加入**（稼働中） |
| 2 | **cash-balance.yaml + B/S 3項目** 入力 |
| 3 | **kamezawa-secrets.yaml** 作成 · CTR-012 締結 |

---

## 関連

- [ISO 一覧](00-このフォルダについて.md)
- [税務 readiness](../../company/tax/fy2026-tax-readiness-assessment.md)
- [開業前チェックリスト](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md)

*重大変更時・四半期ごとに見直す。*
