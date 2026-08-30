# Steward 現状評価 — 株式会社MAL（テナントインスタンス）

**評価日:** 2026年7月5日（Phase B — モジュール · Agent 最小化）  
**対象:** テナント `mal` · FY2026 · **会社 OS 総合採点** 
**ISO 内部監査の節のみ 2026年8月29日に実測で更新**（他の節は評価日時点）

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
| **ビジネスモジュール** | rental · hospitality · travel_booking · **jp_medical_device** |
| **コア Agent** | executive · secretary · finance · operations |
| **モジュール Agent** | rental · hospitality · travel_booking · medical_device_regulatory |
| **マニフェスト** | [`data/operator/agents.yaml`](../../data/operator/agents.yaml) |

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

## ISO 内部監査 — 自己評価

**測定日:** 2026年8月29日 · **実測:** `orgos iso records check --tenant mal` · `orgos iso audit run --tenant mal` · `orgos iso requirements --tenant mal`

認証も適正意見も出さない。以下は**適合性の事前検査**（記録の存在と内容）の実測であり、ISO 19011 の内部監査（`orgos iso audit plan create` 以降）は別に人が判定する。

### 規格の適用状況（catalog available 12 を有効化）

| 区分 | 件数 | 規格 |
|------|:----:|------|
| 適用（applicable） | **11** | 9001 · 27001 · 21401 · 13485 · 37000 · 22301 · 45001 · 14001 · 50001 · 37001 · 20000 |
| 適用除外（excluded） | **1** | 22000 — 食品製造・フードチェーンを営まない（偽 HACCP で適合を出さない） |

### A層 記録の内容（73 記録）

| 状態 | 件数 | 意味 |
|------|:----:|------|
| 適合 | **7** | 様式が埋まり、記録仕様（`records.yaml`）を満たす |
| 不備 | **16** | ファイルはあるが内容が仕様違反 |
| 未作成 | **50** | 様式が配置されていない |

規格別の内訳: 21401 が 12 記録中 11 件不備・1 件適合で最も進み、13485 は 4 不備 / 3 未作成 / 2 適合。**14001 · 45001 · 50001 · 20000 · 37001 は全件未作成**。`orgos iso templates <ID> --write` で様式を配置してから記入する。

22000（適用除外）の 4 記録も未作成だが、除外を主張する側の責任として `applicability.md`（適用範囲と除外理由）だけは残す。残り 3 記録は除外により不要。

### B層 要求事項の被覆（389 件）

未被覆・孤立統制・参照切れはゼロ。ただし **389 件すべてが `verified_on` 未記入**であり、statement は規格票の転記ではなく言い換えである。したがって本検査が示すのは「規格への網羅性」ではなく「想定した要求事項への網羅性」にとどまる。

### 事前検査の総合（11 規格 · 71 統制）

| 総合 | 適合 | 観察 | 不適合 |
|------|:----:|:----:|:------:|
| **不適合** | 5 | 2 | 64 |

不適合の主因は成熟度で、`maturity_below_target` が 62 件（規格を有効化した直後の当然の状態）。記録側は `doc_missing` 2 件・`record_invalid` 2 件。着手順序は P1 4 件 · P2 9 件 · P3 53 件。

**併記:** 71 所見のうち 18 件が判定の根拠以外のギャップも抱える。例として `CTL-CORE-risk-approach` は判定が `doc_missing`（9001 のリスク一覧が未作成）だが、併記として既存 3 ファイル（21401 risk-opportunities · 27001 risk-register · 9001）の内容不備 5 件が同じ行に出る。「作る」と「直す」を取り違えないため、レポートの問題点・課題表に併記列を持つ。

### 規程・自己宣言

| 項目 | 状態 |
|------|------|
| ISO-37000 | 11原則の**自己宣言ドラフト**（`status: ready` · `signed_at: null`）。第三者認証ではない |
| REG-025 / REG-026 | **適用** — 医療機器 QMS · GVP の運用台帳 · ADR 0064 |
| jp_jsox | **有効** — 財務報告内部統制の内部評価のみ（内部統制報告書・EDINET は出さない） |

### この節の次アクション

| 優先 | 内容 | 手段 |
|:----:|------|------|
| P1 | 全件未作成の 5 規格（14001 · 45001 · 50001 · 20000 · 37001）に様式を配置 | `orgos iso templates <ID> --write` |
| P1 | 22000 の `applicability.md` に適用範囲と除外理由を記載 | 除外の根拠を残す |
| P1 | 21401 の不備 11 件を記入で解消（プレースホルダ残存 6 本） | 記録担当が実文言で記入 |
| P2 | 成熟度 L0 の統制を運用実績で引き上げ | 運用記録を証拠パスへ |
| P3 | requirements の `verified_on` を規格票と突合して埋める | 規格票を持つ担当のみ |

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
- [事前検査の最新レポート](../../audit/internal/latest-iso-audit.md)
- [FY2026 内部監査計画](internal-audit-plan-fy2026.md)
- [フレームワーク評価](../../../../../docs/framework-assessment.md)
- [税務 readiness](../../company/tax/fy2026-tax-readiness-assessment.md)

*重大変更時 · 四半期ごとに見直す。*
