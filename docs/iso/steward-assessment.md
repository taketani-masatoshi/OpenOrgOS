# Steward 現状評価 — 株式会社MAL

**評価日:** 2026年6月（ロードマップ10項目対応後）  
**対象:** Steward OS リポジトリ＋FY2026 事業実態

---

## 総合所見

| 領域 | 成熟度 | 一言 |
|------|:------:|------|
| データ基盤（YAML・CLI） | ●●●●○ | **95% (A)** · validate/sync/status 整備 |
| 契約台帳 | ●●●○○ | 貸付・Airbnb executed、**保険・清掃は手続中** |
| 法人書類・決算 | ●●●○○ | 税理士チェックリスト整備、**数値 TBD 残** |
| 社内規程 | ●●●●○ | **REG 全16件** 制定文書化（001-008は2027/3/15付） |
| ISO / MS | ●●●○○ | **L2 記録開始**（リスク・監査計画・KPI） |
| 許認可・保険 | ●●○○○ | `licenses/` 整備、**証券・スキャン待ち** |
| 運用（OTA・清掃） | ●●●○○ | ゲスト文書・Airbnb executed、清掃業者選定中 |

**次:** 保険証券取得、清掃締結、`kamezawa-secrets.yaml` 作成（データ成熟度 95%+ へ）。

---

## Steward OS データ成熟度

| 項目 | 値 |
|------|-----|
| **総合** | **95% (A)** — `npm run steward -- status` |
| スキーマ | 20/20 · operations/hr/loan 拡張 |
| 参照整合性 | loan↔contract↔property 自動検証 |
| 月次収支 | FY2026 **12/12** ヶ月 |
| CSV 同期 | `steward sync all` |

カタログ: [`cursor/data/README.md`](../../cursor/data/README.md)

---

## ロードマップ対応状況

| # | 項目 | 状態 |
|---|------|------|
| ① | CTR-008/009 + 利益相反議事録 | ✅ [議事録](corporate/fy2026-torishimari-gijiroku-yakuin-kashitsuke.md) · [02-executed](contracts/CTR-008/02-executed.md) |
| ② | 保険 CTR-013/014 | 🟡 [加入パケット](contracts/CTR-013/02-enrollment-packet.md) — **証券待ち** |
| ③ | Airbnb + 清掃 | 🟡 CTR-010 ✅ · CTR-012 [選定中](contracts/CTR-012/02-vendor-selection.md) |
| ④ | ゲスト TBD → PDF | 🟡 公開情報反映 · [PDF.md](operations/lodging/PDF.md) · secrets要作成 |
| ⑤ | licenses/ | ✅ [licenses/](corporate/licenses/) |
| ⑥ | 税理士 TBD | 🟡 [checklist](corporate/fy2026-tax-advisor-checklist.md) |
| ⑦ | REG-001〜008 制定 | ✅ [株主総会议事録](corporate/fy2027-shukai-gijiroku-regulations-governance.md) |
| ⑧ | 内部監査 + MR | ✅ [plan](iso/internal-audit-plan-fy2026.md) · [MR](iso/management-review-fy2026-template.md) |
| ⑨ | ISO L2 | ✅ リスク・SoA・KPI・BCP連絡網 |
| ⑩ | 定款要約・契約 executed | ✅ [teikan](corporate/teikan-summary.md) · CTR-002〜009 02-executed |

---

## 関連

- [ISO 一覧](iso/README.md)
- [契約](contracts/README.md)
- [社内規程](corporate/regulations/README.md)
- [業務台帳](operations/README.md)

*重大変更時に見直す。*
