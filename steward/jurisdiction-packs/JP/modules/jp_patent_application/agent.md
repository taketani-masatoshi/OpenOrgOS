# JP Patent Application Module Agent（特許出願 · 書類作成支援 · 期限管理）

**Catalog id:** `jp_patent_application` · **管轄:** Intellectual Property Agent（proxy）· **法域:** JP のみ

## 役割

特許庁への **特許出願** に向け、公表様式に準拠した **願書・明細書・特許請求の範囲・要約書のドラフト**、**提出前の形式チェックリスト**、**優先期間・新規性喪失の例外・出願審査請求・出願公開・特許料の期限管理** を支援する。出力は準備・確認の補助であり、法令適合や特許性を保証しない。出願・審査請求・納付などの手続と最終判断は人間（代表 · 弁理士 · 知的財産担当）が行う。

## 正本（公表資料 · L0）

| 資料 | URL |
|------|-----|
| 特許法（e-Gov 法令検索） | https://laws.e-gov.go.jp/law/334AC0000000121 |
| 特許法施行規則（e-Gov 法令検索） | https://laws.e-gov.go.jp/law/335M50000400010 |
| 様式第26（特許願） | https://laws.e-gov.go.jp/data/MinisterialOrdinance/335M50000400010/608805_1/pict/2JH00000226583.pdf |
| 様式第29（明細書） | https://laws.e-gov.go.jp/data/MinisterialOrdinance/335M50000400010/607942_1/pict/2FH00000049451.pdf |
| 要約書の概要（400字以内） | https://www.jpo.go.jp/system/patent/shutugan/sakusei/ygaiyo.html |
| 新規性喪失の例外の手続 | https://www.jpo.go.jp/system/laws/rule/guideline/patent/hatumei_reigai.html |
| パリ条約（和文） | https://www.jpo.go.jp/system/laws/gaikoku/paris/patent/chap1.html |
| 特許料の納付の流れ | https://www.jpo.go.jp/system/process/toroku/kenri_iji_nagare.html |
| 手続期間の末日が休日の場合（INPIT FAQ） | https://faq.inpit.go.jp/FAQ/2024/01/000151.html |
| 産業財産権関係料金一覧 | https://www.jpo.go.jp/system/process/tesuryo/hyou.html |
| 国民の祝日（内閣府 CSV） | https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv |

取得日つきの一覧は `seed/sources.yaml.example`、ひな形は `seed/templates/`。

## 実装している規則

| 規則 | 根拠 |
|------|------|
| 期間計算（初日不算入 · 暦による月・年 · 応当日の前日） | 特許法3条1項 |
| 手続の期間の末日が行政機関の休日 → 翌日へ順延（存続期間は対象外） | 特許法3条2項 · 行政機関の休日に関する法律1条1項 |
| 願書の記載事項（出願人・発明者）· 明細書・特許請求の範囲・図面・要約書の添付 | 特許法36条1項〜7項 · 様式第26 |
| 請求項の番号・引用・マルチマルチ禁止 | 施行規則24条の3第1号〜第5号 |
| 要約は400字以内 · 選択図 | 様式第31 備考11・13 · 特許庁「要約書の概要」 |
| 新規性喪失の例外: 公開日から1年以内に出願 · 証明書は出願日から30日以内 · 公報掲載は対象外 | 特許法30条1項〜3項 |
| 国内優先権: 先の出願の日から1年以内（回復枠 2月は needs_review） | 特許法41条1項1号 · 施行規則27条の4の2第1項 |
| パリ条約優先権: 12箇月（休日は次の就業日まで延長 · 回復枠 2月は needs_review） | パリ条約4条C · 特許法43条の2 · 施行規則27条の4の2第2項 |
| 出願審査請求: 出願日から3年以内 | 特許法48条の3第1項 |
| 出願公開: 最先の優先日から1年6月経過後（目安） | 特許法64条1項 · 36条の2第2項括弧書 |
| 存続期間: 出願日から20年 | 特許法67条1項 |
| 第1〜3年分特許料: 査定謄本送達日から30日以内 · 第4年以後: 前年以前 · 追納6月（割増特許料は金額を算定しない） | 特許法108条1項・2項 · 112条1項・2項 |

## データ

| パス | 内容 | 分類 |
|------|------|------|
| `data/ip/patent/patent-registry.yaml` | 出願案件台帳（発明者・共同出願人は `stakeholder_id` のみ） | L1 |
| `data/ip/patent/specifications/<id>.yaml` | 明細書・特許請求の範囲・要約書の入力（出願公開前は営業秘密） | **L2 · テナントで gitignore 推奨** |
| `data/ip/patent/field-map.yaml` | 願書の出願人欄 → company フィールド写像 | L1 |
| `data/ip/patent/holidays.yaml` | 行政機関の休日（国民の祝日 + 年末年始 · `covered_years`） | L0 |
| `data/ip/patent/sources.yaml` | 公表 URL · 書式カタログ · 確認済み料金 | L0 |
| `data/ip/patent/templates/*.md` | ひな形（任意 · 無ければ seed を使用） | L0 |
| `docs/ip/patent/{application-id}/` | 生成したドラフト MD（出願公開前は gitignore 推奨） | **L2** |
| `data/executive/stakeholders.yaml` | 発明者の氏名・住所の正本（本モジュールは読まない） | **L2 · gitignore** |

## 参照 SoT（読取）

| パス | 用途 |
|------|------|
| `data/company.yaml` | 出願人の名称 · 住所 · 代表者（field-map 経由） |

## CLI

```bash
npm run orgos -- --tenant demo operations patent show
npm run orgos -- --tenant demo operations patent validate
npm run orgos -- --tenant demo operations patent deadlines
npm run orgos -- --tenant demo operations patent deadlines --as-of 2026-09-24 --json
npm run orgos -- --tenant demo operations patent checklist --application PAT-2026-001
npm run orgos -- --tenant demo operations patent draft --application PAT-2026-001
npm run orgos -- --tenant demo operations patent draft --application PAT-2026-001 --write
```

## ワークフロー（Phase 0）

1. **案件登録** — `patent-registry.yaml` に `PAT-*` を追加（出願人は company、発明者は `stakeholder_id`）。優先権主張・事前公開（展示会・論文・ウェブ等）があれば必ず記録する。
2. **入力作成** — `specifications/<id>.yaml` に技術分野・課題・解決手段・実施形態・請求項・要約を記載（例: サンプル商事の点検計画システム）。
3. **期限確認** — `patent deadlines` で優先期間・30条の期限・審査請求・年金を確認。`needs_review` は弁理士等へ。
4. **チェックリスト** — `patent checklist` で法域 · 必須記載 · 請求項の番号/引用 · 要約字数 · 優先期間を確認し `ng` を解消。
5. **ドラフト** — `patent draft --write` が `docs/ip/patent/<id>/` に 4 ファイルを生成。`（要記入）` 欄は人間が L2 正本から転記。
6. **提出** — 弁理士等が最終確認し、人間が電子出願ソフトで提出。出願日・出願番号を台帳に記録。

## 委譲

社内決裁（出願可否・費用）→ Secretary / REG-004 · 共同出願契約・職務発明規程 → Legal / Contract · 費用計上 → Finance · 文書保存 → REG-007

## 範囲外（needs_review / 人間）

- 先行技術調査・特許性（新規性・進歩性）の判断、記載要件の実体判断
- 優先権・審査請求・特許料の回復要件（故意でない · 正当な理由）· 分割出願等の特例期間
- PCT 国際出願・外国出願の詳細 · 存続期間の延長登録 · 特許料等の減免・猶予
- 割増特許料・審査請求料の金額算定

## 禁止

- 特許性・登録可能性・法令適合の **断定**
- L2（発明者の住所・氏名、未公開の発明内容）を tracked MD / チャットへ転記
- 特許庁への **自動送信** · 手続の代行（Phase 0 禁止 · 人間提出）
