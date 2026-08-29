# 亀沢旅館 — 法定保管義務帳簿カタログ

**PROP-002** · **制定:** 2026-08-24  
**根拠:** 旅館業法 · 旅館業法施行規則 · 消防法 · 東京都宿泊税条例 · 会社法/法人税法 · REG-010/012/027

> Web 参照（2026-08 時点）: [厚労省 宿泊者名簿 FAQ](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000188411.html) · [消防用設備点検（消防法17条の3の3）](https://fdfujisan-nantou.shizuoka.jp/life/prevent/%E6%B6%88%E9%98%B2%E7%94%A8%E8%A8%AD%E5%82%99%E7%AD%89%E3%81%AE%E7%82%B9%E6%A4%80%E3%83%BB%E5%A0%B1%E5%91%8A%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6)

---

## 1. 旅館業法 — 宿泊者関連（必須）

| 帳簿 | 法令 | 記載事項（最低限） | 保存期間 | 様式 | 記録パス | OrgOS |
|------|------|-------------------|:--------:|------|----------|-------|
| **宿泊者名簿** | 旅館業法第6条 · 施行規則第4条の2 | 氏名・住所・**連絡先**（電話等）。国内住所なし外国人は **国籍・旅券番号** | **3年**（REG-010/012 は **5年**） | [templates/compliance/宿泊者名簿.csv](templates/compliance/宿泊者名簿.csv) | `records/{YYYY}/{MM}/宿泊者名簿.csv` | `register-append` · `register-validate` |
| **外国人宿泊者届** | 同法第6条第2項 | 届出控え（24h 以内）· 旅券写しは Git 外 | 3年（控え） | [templates/compliance/外国人宿泊者届.csv](templates/compliance/外国人宿泊者届.csv) | `records/{YYYY}/{MM}/外国人宿泊者届.csv` | 手動 + 様式 |
| **宿泊料金掲示** | 第5条 | 料金表の掲示 | 常時 | guest-facing/ | 施設内掲示 + PDF outbox | — |

**注意（2024以降の運用）:** 連絡先は必須。職業・年齢は自治体/社内規程で追加可。電磁保存可だが **行政要求時に即時出力** できること。

---

## 2. 消防法 — 点検・報告

| 帳簿 | 法令 | 頻度 | 保存 | 様式 | 記録パス |
|------|------|------|------|------|----------|
| **消防用設備点検記録** | 消防法第17条の3の3 | 機器 **6ヶ月** · 総合 **1年** · 報告 **1年** | **3年以上** | [templates/maintenance/消防点検記録.csv](templates/maintenance/消防点検記録.csv) | `records/{YYYY}/maintenance/消防点検記録.csv` |
| **定期点検（月次自主）** | 社内 REG-012 | 月1 | 3年 | [templates/maintenance/定期点検-月次.md](templates/maintenance/定期点検-月次.md) | `records/{YYYY}/maintenance/定期点検-{YYYY-MM}.md` |
| **消防訓練記録** | 消防法第8条等 | 年2回以上（収容30名超） | 3年 | 消防計画別紙 | `records/{YYYY}/maintenance/`（未整備） |

消防法令適合通知書・配置証明の **原本** は `docs/company/licenses/records/`（L2）。

---

## 3. 東京都宿泊税

| 帳簿 | 法令 | 内容 | 保存 | 正本 | OrgOS |
|------|------|------|------|------|-------|
| **宿泊税台帳** | 都条例 | 課税対象宿泊・特別徴収額 | 7年（実務） | `data/operations/lodging-tax.yaml` | `tax-compute` · `tax-status` · `tax-pack` |
| **申告控え** | 同上 | 月次申告書・納付書控え | 7年 | `operations/tax-packs/{YYYY-MM}.md` + 官公庁控え（L2） | `tax-filed` · `tax-pay` |

特別徴収義務者 **登録** は `permit-registry`（`pt-lodging-tax-registration`）— 人間 TODO。

---

## 4. REG-012 運用帳簿（社内規程 · 法定直下）

| 帳簿 | 用途 | 保存 | 様式 | 記録パス |
|------|------|:----:|------|----------|
| 予約稼働台帳 | 予約・売上管理 | 3年 | operations/予約稼働台帳.csv | `records/.../operations/` |
| チェックイン/アウト確認 | CI/CO 手順証跡 | 3年 | operations/チェックイン確認.csv 等 | 同上 |
| 日次運営記録 | 日次締め | 3年 | operations/日次運営記録.csv | 同上 |
| 清掃記録・発注 | CTR-012 監督 | 3年 | housekeeping/*.csv | `records/.../housekeeping/` |
| 光熱メーター | REG-014 連携 | 3年 | maintenance/光熱メーター記録.csv | `records/.../maintenance/` |
| 設備故障・メンテ | 安全 | 3年 | maintenance/*.csv | 同上 |
| クレーム記録 | REG-012 第5条 | 3年 | guest-service/クレーム記録.csv | `records/.../guest-service/` |

---

## 5. 法人会計帳簿（会計ソフト非導入 · OrgOS 正本）

外部 SaaS は使わない。**Accounting Agent** が CSV/YAML/MD を正本とし、`orgos ledger` で GL・試算表・経営指標を出力する。

| 帳簿 | 保存 | 正本（YAML） | 人間可読（CSV/MD） | CLI |
|------|:----:|-------------|-------------------|-----|
| 仕訳帳 | 10年 | `data/finance/journal-entries.yaml` | `docs/finance/accounting/records/仕訳一覧.csv`（export） | `orgos ledger post` |
| 総勘定元帳 | 10年 | （仕訳から派生） | `orgos ledger gl` → MD | `orgos ledger gl` |
| 試算表 | 10年 | — | `orgos ledger export --template trial-balance-csv` | 同上 |
| 現金出納帳 | 10年 | `bank-statements.yaml` | `docs/finance/accounting/records/現金出納帳.csv` | `orgos jp bank statement import` |
| 経費精算台帳 | 7年 | `expense-claims.yaml` | records/経費精算台帳.csv | `orgos expense-claim` |
| 領収書索引 | 7年 | document-io | records/領収書索引.csv | `steward io` |
| 固定資産台帳 | 10年 | `fixed-assets.yaml` | records/固定資産台帳.csv | `orgos ledger post --source depreciation` |

詳細: [docs/finance/file-based-accounting-runbook.md](../../../../finance/file-based-accounting-runbook.md)

---

## 6. 初期化状態（2026-08-24）

| 区分 | 様式 | records ダミー | 備考 |
|------|:----:|:-------------:|------|
| 宿泊者名簿 | ✅ | ✅ 1行 | validate OK |
| 外国人宿泊者届 | ✅ | ✅ 1行 | 該当なし行（運用例） |
| 消防点検 | ✅ | ✅ 1行 | PER-FIRE-001 active（2026-08-20） |
| 宿泊税 | ✅ | ✅ YAML | 2026-07 paid · 2026-08 pack_ready |
| 日常運用 CSV 7種 | ✅ | ✅ 各1行 | 2026/08 |
| 会計 CSV 5種 | ✅ | ✅ 各1行 | YAML が SSOT · `ledger export` |

---

## 7. 運用コマンド

```bash
STEWARD_TENANT=mal npm run orgos -- operations hospitality register-validate
STEWARD_TENANT=mal npm run orgos -- operations hospitality records-check
STEWARD_TENANT=mal npm run orgos -- operations hospitality blockers
STEWARD_TENANT=mal npm run orgos -- ledger export
STEWARD_TENANT=mal npm run orgos -- skills run journal-export-csv --month YYYY-MM
STEWARD_TENANT=mal npm run orgos -- ledger trial-balance --as-of 2026-08-31
STEWARD_TENANT=mal npm run orgos -- validate
```

---

## 関連

- [guest-register-rules.md](guest-register-rules.md)
- [records-ongoing-guide.md](records-ongoing-guide.md)
- [pre-opening-checklist.md](pre-opening-checklist.md)
- [REG-012 宿泊運営規程](../../../company/regulations/shukuhaku-unyo-kisoku.md)
