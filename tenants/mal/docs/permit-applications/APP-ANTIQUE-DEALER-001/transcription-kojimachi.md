# 麹町警察署 公式様式への転記メモ — APP-ANTIQUE-DEALER-001

**提出先（推定）:** 東京都公安委員会（経由: **麹町警察署**）  
**主たる営業所:** 東京都千代田区二番町1（株式会社MAL）  
**注意:** OOO 出力 PDF は **内部ひな形**。署の最新公式様式（警察署窓口・東京都公安委員会案内）へ、下表で転記すること。署への自動提出は行わない。

## OOO → 公式様式（典型欄）

| 公式様式でよくある欄 | OOO 差込値（`draft` 時点） |
|----------------------|---------------------------|
| 申請年月日 | 令和8年7月14日 |
| 申請者の氏名又は名称 | 株式会社MAL |
| 申請者の住所 | data/company.yaml の本店（千代田区二番町1） |
| 代表者の氏名 | 段燕燕 |
| 代表者の住所 | 本店住所を流用（個人住所 L2 は台帳化していない） |
| 主たる営業所の所在地 | 同上（二番町1） |
| 主たる営業所の名称 | 株式会社MAL |
| 管理者 | 段燕燕（代表者と同一） |
| 取り扱う古物の区分 | 衣類・本・雑貨・時計・鞄等の日用品、PC・スマホ等の小物（買取は原則1点30万円以下） |

## 添付（署チェックリスト優先 · OOO は生成しない）

- 法人: 定款 · 登記事項証明書 · 役員の住民票・略歴書・誓約書 等
- 営業所見取図 · 土地建物関係書類
- 手数料（都道府県公示額）

## OOO 成果物

| ファイル | 用途 |
|----------|------|
| `docs/permit-applications/APP-ANTIQUE-DEALER-001/application.pdf` | 社内レビュー用ひな形 |
| `docs/io/outbox/submissions/APP-ANTIQUE-DEALER-001-application.pdf` | outbox 提出パック |
| `…/application.md` · `application.tex` | 編集用源 |
| `…/procedures.md` | 手続ステップ |
| `data/permit-applications/handoffs/APP-ANTIQUE-DEALER-001.yaml` | 提出先メモ |

提出後: `permit-app submit-mark` → 許可証受領後 `approve --permit-number … --issued-on …`
