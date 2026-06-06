# テンプレート — 6. 契約計画（10）

**保存先:** `docs/plans/contracts/` · **正データ:** `cursor/data/contracts/`

---

## 6.1 賃貸借契約計画 — CTR-011 · Contract · 更新時
## 6.2 管理委託契約計画 — 自社/委託 · Property Rental · 年次
## 6.3 清掃委託契約計画 — CTR-012 · Contract · Hospitality · draft 解消 P1
## 6.4 OTA 契約計画 — 利用規約 · Hospitality · 年次
## 6.5 保険契約計画 — CTR-013/014 · Compliance · P0
## 6.6 工事契約計画 — 修繕業者 · Operations · 案件毎
## 6.7 業務委託契約計画 — B2B · Contract · 随時
## 6.8 顧問契約計画 — 税理士等 · Compliance · 年次
## 6.9 契約更新管理計画 — 全 CTR 90/60/30 日 · Contract · 月次
## 6.10 契約リスク管理計画 — 不利条項 · Compliance · 四半期

---

## 6.1 賃貸借契約計画

| 項目 | 内容 |
|------|------|
| **目的** | 番町賃貸借（CTR-011）の締結・更新・条項管理 |
| **管理対象** | CTR-011 · 借主 |
| **必要な入力** | 借主情報 · 標準条項 · 入居者獲得計画 |
| **出力** | executed 契約 · 更新通知 |
| **KPI** | draft→executed 日数 · 更新率 |
| **関連フォルダ** | `docs/contracts/CTR-011/` |
| **担当** | Contract · Property Rental |
| **更新頻度** | 随時 |
| **リスク** | draft · 借主 TBD |

---

## 6.5 保険契約計画

| 項目 | 内容 |
|------|------|
| **目的** | 火災・施設賠償の加入・更新・カバー範囲管理 |
| **管理対象** | CTR-013（番町）· CTR-014（亀沢） |
| **必要な入力** | 加入パケット · 証券 PDF · inbox |
| **出力** | executed · 更新カレンダー |
| **KPI** | カバー率 100% · 更新漏れ 0 |
| **関連フォルダ** | `docs/contracts/CTR-013/` · `CTR-014/` |
| **担当** | Contract · Compliance |
| **更新頻度** | 年次 · P0 即時 |
| **リスク** | **未加入（最大リスク）** |

---

## 6.9 契約更新管理計画

| 項目 | 内容 |
|------|------|
| **目的** | 全 CTR の期限アラートと更新ワークフロー |
| **管理対象** | CTR-001〜014 |
| **必要な入力** | contracts YAML · maturity · renewal |
| **出力** | 期限レポート · タスク |
| **KPI** | 更新漏れ 0 · アラート lead time |
| **関連フォルダ** | `cursor/data/contracts/` · `docs/plans/contracts/renewal-management-plan.md` |
| **担当** | Contract · Operations |
| **更新頻度** | 月次 |
| **リスク** | 自動通知未実装 |

---

（6.2–6.4, 6.6–6.8, 6.10 は [06-file-manifest.md](../06-file-manifest.md) の個別 MD で展開。構造は上記 6.1/6.5/6.9 と同一。）
