# Steward 現状評価 — 株式会社MAL（テナントインスタンス）

**評価日:** 2026年6月9日（第4回 — **OS-99+ Cycle 1**）  
**対象:** テナント `mal` · FY2026 · **会社 OS 総合採点**

> **会社 OS 採点:** [framework-assessment.md §10](../../../../../docs/framework-assessment.md) · `npm run steward -- status --os-99`

---

## 会社 OS 総合（OS-99+）

| 成分 | 点数 | 備考 |
|------|:----:|------|
| 製品（フレームワーク） | 99 | §9 実測 · REF-4c 完了 · REF-4b/d −1 |
| MAL 準備度 | **97%** | `steward status` |
| MAL 運用度 | **84%** | **ops p0 ブロッカー 5 — 最大ギャップ** |
| MAL 自動化度 | **100%** | daily/weekly · classification |
| **総合（加重）** | **`status --os-99` で確認** | 出口 **≥ 99** |

```bash
npm run steward -- status --os-99
npm run steward -- ops p0   # exit 1 · 5 ブロッカー
```

**99+ 経路:** P0 5 件クローズ（運用 84→95+）→ 総合 **~97+** · 製品 99 到達済 · REF-4b/d で製品 100 可

---

## 総合所見（MAL · 三次元）

| 次元 | スコア | 根拠 |
|------|:------:|------|
| **準備度** | **95%** | validate ✓ · tsc ✓ · compliance gap ✓ · 有効規程 14件 · 契約パケット整備 |
| **運用度** | **88%** | ops p0 ブロッカー **5 件**（契約3 · secrets · cash-balance） |
| **自動化度** | **96%** | `npm run daily`/`weekly` · pipeline · classification boundaries |

**総合: 準備 95% / 運用 88%** — 実手続・実データ完遂で運用 100%。

`steward status` 三次元の定義: [framework-assessment.md §4](../../../../../docs/framework-assessment.md#4-テナント成熟度三次元)

---

## ops p0 ブロッカー（2026-06-09 実測）

| ID | 状態 | 備考 |
|----|:----:|------|
| CTR-013 | draft | 手続完了待ち |
| CTR-014 | draft | 手続完了待ち |
| CTR-012 | draft | 手続完了待ち |
| secrets-kamezawa | 未作成 | `kamezawa-secrets.yaml` — example からコピー |
| cash-balance | template | `status: confirmed` + 残高入力待ち |

```bash
npm run steward -- --tenant mal ops p0
# → ブロッカー 5 件
```

---

## コマンド結果（2026-06-09）

| コマンド | 結果 |
|---------|------|
| `npm run validate` | ✓ 全 YAML 有効（warnings: secrets · cash-balance · backup stamp） |
| `npm run check` | ✓ mal · demo · acme · modules · classification |
| `npx tsc --noEmit` | ✓ exit 0（FIX-A1） |
| `steward compliance gap` | ✓ |
| `steward ops p0` | ブロッカー **5 件** |

---

## ガバナンス

| 項目 | 状態 |
|------|------|
| 有効規程 | **14 件**（`regulations.yaml` enabled · REG-001〜016 + REG-012 宿泊） |
| ISO-27001 運用記録 | executive バックアップ週次ログテンプレ追加 |
| Git 履歴 R-001 | mitigated — filter-repo は段承認待ち |

---

## 100% に必要なアクション（MAL · 人間完遂）

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

## 契約台帳（MAL）

| ステータス | 件数 | 備考 |
|-----------|:----:|------|
| executed | 10 | CTR-001〜010 |
| draft | 4 | CTR-011, 012, 013, 014 — 手続パケット整備済み |

---

## Top 3 推奨（MAL）

1. **CTR-014 火災保険加入**（稼働中）
2. **cash-balance.yaml + B/S 3項目** 入力
3. **kamezawa-secrets.yaml** 作成 · **CTR-012** 締結

---

## 関連

- [ISO 一覧](00-このフォルダについて.md)
- [フレームワーク評価](../../../../../docs/framework-assessment.md)
- [spec.md](../../../../../docs/spec.md)
- [税務 readiness](../../company/tax/fy2026-tax-readiness-assessment.md)

*重大変更時 · 四半期ごとに見直す。*
