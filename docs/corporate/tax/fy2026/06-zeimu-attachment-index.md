# 税務添付書類一覧・保管場所

**株式会社MAL · 第9期（FY2026）税務申告**

本書は法人税・住民税・消費税・固定資産税の申告に必要な書類と、Steward リポジトリ内の保管場所を対応付けます。

---

## 1. 申告必須書類（第9期）

| # | 書類 | 提出先 | Steward 上の場所 | 状態 |
|---|------|--------|-----------------|:----:|
| 1 | 法人税申告書（B様式）＋別表 | 税務署 | [`tax/fy2026/01-hojinzei-shinkoku-yoko.md`](01-hojinzei-shinkoku-yoko.md)（要約） | 要作成 |
| 2 | 決算書（P/L・B/S） | 税務署 | [`fy2026-keisansyorui.md`](../../fy2026-keisansyorui.md) | P/L ○ B/S △ |
| 3 | 法人概況説明書 | 税務署 | [`fy2026-hojin-gaikyo.md`](../../fy2026-hojin-gaikyo.md) | ドラフト ○ |
| 4 | 勘定科目内訳明細書 | 税務署 | — | **TBD** |
| 5 | 事業報告書 | 税務署（添付） | [`pdf/jigyo/FY2026-jigyo-hokoku.pdf`](../../pdf/jigyo/) | PDF要確認 |
| 6 | 株主総会議事録 | 社内保管 | [`fy2026-shukai-gijiroku.md`](../../fy2026-shukai-gijiroku.md) | ドラフト ○ |
| 7 | 取締役会議事録 | 社内保管 | [`fy2026-torishimari-gijiroku.md`](../../fy2026-torishimari-gijiroku.md) | ドラフト ○ |
| 8 | 法人住民税・事業税申告書 | 東京都・千代田区 | [`04-hojin-juminzei-tokyo.md`](04-hojin-juminzei-tokyo.md) | 要作成 |
| 9 | 消費税申告書 | 税務署 | [`02-shohizei.md`](02-shohizei.md) | **要否 TBD** |
| 10 | 法定調書合計表 | 税務署 | [`03-gensenchoshu-etc.md`](03-gensenchoshu-etc.md) | 該当なし想定 |
| 11 | 償却資産税申告書 | 千代田区・墨田区 | [`05-kotei-shisanzei.md`](05-kotei-shisanzei.md) | **TBD** |

---

## 2. 根拠資料・契約書

| # | 書類 | 用途 | 場所 |
|---|------|------|------|
| 1 | 登記簿謄本（履歴事項全部証明） | 資本金・代表者 | [`licenses/corporate-registry/`](../../licenses/corporate-registry/) |
| 2 | 定款 | 資本金・事業目的 | 同上 |
| 3 | 役員貸付契約 CTR-008 | 番町融資 | [`docs/contracts/CTR-008/`](../../../../contracts/CTR-008/) |
| 4 | 役員貸付契約 CTR-009 | 亀沢融資 | [`docs/contracts/CTR-009/`](../../../../contracts/CTR-009/) |
| 5 | 本社兼用 CTR-003 | 按分 | [`docs/contracts/CTR-003/`](../../../../contracts/CTR-003/) |
| 6 | 業務委託 CTR-001 | Steward保守 | [`docs/contracts/CTR-001/`](../../../../contracts/CTR-001/) |
| 7 | 役員貸付承認議事録 | 利益相反 | [`fy2026-torishimari-gijiroku-yakuin-kashitsuke.md`](../../fy2026-torishimari-gijiroku-yakuin-kashitsuke.md) |

---

## 3. 数値正データ（YAML）

| データ | パス |
|--------|------|
| 会社情報 | [`cursor/data/company.yaml`](../../../../cursor/data/company.yaml) |
| 月次予実 | [`cursor/data/plans/yojitsu-fy2026.yaml`](../../../../cursor/data/plans/yojitsu-fy2026.yaml) |
| 利益計画 | [`cursor/data/plans/profit-plan.yaml`](../../../../cursor/data/plans/profit-plan.yaml) |
| 費用計画 | [`cursor/data/plans/expense-plan.yaml`](../../../../cursor/data/plans/expense-plan.yaml) |
| 物件 | [`cursor/data/properties/`](../../../../cursor/data/properties/) |
| 融資 | [`cursor/data/finances/loans.yaml`](../../../../cursor/data/finances/loans.yaml) |

---

## 4. inbox / outbox / licenses

### 4-1. docs/inbox/（受信・未処理）

| 想定書類 | 用途 |
|---------|------|
| 銀行残高証明（2027/1/31） | B/S 現金 |
| 固定資産税通知書（千代田・墨田） | 評価額 |
| 税理士からのドラフト申告書 | 確認用 |
| 登記簿謄本（最新） | 資本金 |

索引: [`docs/inbox/00-このフォルダについて.md`](../../../../inbox/00-このフォルダについて.md)

### 4-2. docs/outbox/（提出・印刷済）

| 想定書類 | 用途 |
|---------|------|
| 法人税申告書 PDF（e-Tax控） | 保管 |
| 決算報告書 PDF | 株主総会 |
| 償却資産税申告書（提出控） | 各区 |

索引: [`docs/outbox/00-このフォルダについて.md`](../../../../outbox/00-このフォルダについて.md)

### 4-3. docs/corporate/licenses/

| サブフォルダ | 内容 |
|-------------|------|
| [`corporate-registry/`](../../licenses/corporate-registry/) | 登記・定款 |
| [`ryokan/`](../../licenses/ryokan/) | 旅館業許可等 |
| [`insurance/`](../../licenses/insurance/) | 保険証券 |
| [`records/`](../../licenses/records/) | 許認可記録 |

索引: [`licenses/00-このフォルダについて.md`](../../licenses/00-このフォルダについて.md)

---

## 5. 社内決算・総会書類

| 書類 | パス |
|------|------|
| 計算書類 | [`fy2026-keisansyorui.md`](../../fy2026-keisansyorui.md) |
| 決算書（詳細） | [`docs/plans/fy2026-pl.md`](../../../../plans/fy2026-pl.md) |
| 税理士チェックリスト | [`fy2026-tax-advisor-checklist.md`](../../fy2026-tax-advisor-checklist.md) |
| 年間スケジュール | [`fy2026-meeting-schedule.md`](../../fy2026-meeting-schedule.md) |
| readiness 評価 | [`fy2026-tax-readiness-assessment.md`](../fy2026-tax-readiness-assessment.md) |

---

## 6. PDF 生成物

| 書類 | コマンド | 出力先 |
|------|---------|--------|
| 決算報告書 | `npm run steward -- report kessan --fy FY2026` | [`pdf/kessan/`](../../pdf/kessan/) |
| 事業報告書 | `npm run steward -- report jigyo --fy FY2026` | [`pdf/jigyo/`](../../pdf/jigyo/) |
| 年次一括 | `npm run steward -- report annual --fy FY2026` | 上記 |

---

## 7. 不足書類（優先取得）

| 優先 | 書類 | 影響 |
|:----:|------|------|
| 1 | 全銀行残高証明 2027/1/31 | B/S · 申告書 |
| 2 | 登記簿謄本（最新） | 資本金 · 均等割 |
| 3 | 第8期決算書 | 繰越剰余金 |
| 4 | 固定資産税通知書（両区） | 税額 · 按分 |
| 5 | 亀沢 償却資産台帳 | 1/31申告 |
| 6 | 過去消費税申告書（第7・8期） | 免税判定 |

---

## 8. 保管期間

| 書類 | 期間 |
|------|------|
| 申告書・決算書 | **10年** |
| 源泉徴収関連 | 5年 |
| 請求書・領収書 | 7年（消費税） |

---

## 関連

| ファイル | 内容 |
|---------|------|
| [`00-このフォルダについて.md`](00-このフォルダについて.md) | 本パック索引 |
| [`fy2026-tax-readiness-assessment.md`](../fy2026-tax-readiness-assessment.md) | 総合評価 |
