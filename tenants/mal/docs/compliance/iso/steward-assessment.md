# Steward 現状評価 — 株式会社MAL（テナントインスタンス）

**評価日:** 2026年7月5日（Phase B — モジュール · Agent 最小化）  
**対象:** テナント `mal` · FY2026 · **会社 OS 総合採点**

> **会社 OS 採点:** [framework-assessment.md §10](../../../../../docs/framework-assessment.md) · `npm run orgos -- status --os-99`

---

## 会社 OS 総合（OS-99+）

| 成分 | 点数 | 備考 |
|------|:----:|------|
| 製品（フレームワーク） | 99 | §9 実測 |
| MAL 準備度 | **97%** | `steward status` |
| MAL 運用度 | **~90%** | Phase A ダミー確定 · secrets ローカルのみ |
| MAL 自動化度 | **100%** | daily/weekly · classification |
| **総合（加重）** | **`status --os-99` で確認** | Phase C Hub 完了で Wire 軸向上 |

---

## 有効モジュール · Agent（2026-07-05）

| 種別 | 有効 ID |
|------|---------|
| **ビジネスモジュール** | rental · hospitality · travel_booking |
| **OFF** | jp_medical_device（REG-025/026 未施行 · ISO-13485 OFF） |
| **コア Agent** | executive · secretary · finance · operations |
| **モジュール Agent** | rental · hospitality · travel_booking |
| **マニフェスト** | [`data/operator/agents-enabled.yaml`](../../data/operator/agents-enabled.yaml) |

---

## ops p0（デモ確定後 · 2026-07-05）

| ID | 状態 | 備考 |
|----|:----:|------|
| CTR-013/014 | draft | counterparty ダミー確定 · 証券 PDF は実務 |
| CTR-012 | executed | 本社オフィス賃貸 · サウスウッド |
| 亀沢清掃 | ダミー | 墨田クリーンサービス（EXT-003） |
| secrets-kamezawa | example | ローカル gitignore のみ |
| cash-balance | **confirmed** | 1,000万円（2026-07-01） |
| B/S 3項目 | **demo_confirmed** | tax-profile · 株主名簿同期済 |

---

## ISO · コンプライアンス

| 標準 | 状態 |
|------|------|
| ISO-9001 / 27001 / 21401 | 有効 · controls L2+ |
| **ISO-13485** | **無効** — jp_medical_device OFF · validate 警告解消 |
| REG-025 / REG-026 | **未施行** — 参照 MD のみ |

---

## 100% に必要なアクション（実務 · 人間完遂）

| 領域 | 残タスク | 担当 |
|------|---------|------|
| 保険 | CTR-013/014 実加入 · 証券 PDF | 段燕燕 |
| 運用機密 | `kamezawa-secrets.yaml` 実値（ローカル） | 運用担当 |
| 税務 | 実申告 · e-Tax（ダミー SoT とは別） | 税理士 |
| 登記 | 宮城退任登記（2026-08 予定） | 司法書士 |

---

## 契約台帳（MAL）

| ステータス | 件数 | 備考 |
|-----------|:----:|------|
| executed | 10+ | CTR-001〜010 等 |
| draft | 2 | CTR-013/014 火災保険 — counterparty ダミー済 |

---

## OrgOS プロトコル

| シナリオ | 状態 |
|---------|------|
| Witness Hub | Phase C — n=4 · k=3 · docker-compose 拡張 |
| Wire demo | mal ↔ southwood |

正本: [runbook-orgos.md](../../../../../docs/runbook-orgos.md) · [score-90-correction-plan.md](../../plans/score-90-correction-plan.md)

---

## 関連

- [ISO 一覧](00-このフォルダについて.md)
- [フレームワーク評価](../../../../../docs/framework-assessment.md)
- [税務 readiness](../../company/tax/fy2026-tax-readiness-assessment.md)

*重大変更時 · 四半期ごとに見直す。*
