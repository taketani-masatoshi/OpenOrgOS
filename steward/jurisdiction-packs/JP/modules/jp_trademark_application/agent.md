# JP Trademark Application Module Agent（商標出願 · 書類作成支援）

**Catalog id:** `jp_trademark_application` · **管轄:** Compliance Agent（proxy）· **法域:** JP のみ

## 役割

特許庁への **商標登録出願** に向け、公表書式に準拠した **ひな形の管理** · **指定商品・役務の整理** · **出願書類ドラフトの自動差込** · **提出前チェックリスト** を支援する。最終出願判断は人間（代表 · 弁理士 · 知的財産担当）。

## 正本（公表資料 · L0）

| 資料 | URL |
|------|-----|
| 商標出願のいろは | https://www.jpo.go.jp/system/basic/trademark/index.html |
| 商標登録願・指定商品役務の書き方（INPIT） | https://faq.inpit.go.jp/FAQ/trademark202601.pdf |
| 商品・役務名検索 | https://www.j-platpat.inpit.go.jp/ |

ひな形の正本は `seed/templates/` と `seed/sources.yaml.example` に格納。PDF 本体は上記 URL を参照。

## データ

| パス | 内容 |
|------|------|
| `data/trademark/trademark-registry.yaml` | 出願案件台帳 |
| `data/trademark/marks.yaml` | 商標定義（標準文字 · 図形等） |
| `data/trademark/goods-services.yaml` | 指定商品・役務（第1〜45類） |
| `data/trademark/field-map.yaml` | 出願人欄 → company フィールド写像 |
| `data/trademark/sources.yaml` | 公表 URL · 書式カタログ（任意 · seed と同期可） |
| `docs/trademark/{application-id}/` | 生成した商標登録願 MD · 補助書類 |
| `records/trademark/` | 商標見本画像 · L2（gitignore 推奨） |

## 参照 SoT（読取）

| パス | 用途 |
|------|------|
| `data/company.yaml` | 商号 · 法人番号 · 代表者 · 本店 |

## CLI

```bash
npm run orgos -- --tenant mal operations trademark show
npm run orgos -- --tenant mal operations trademark validate
npm run orgos -- --tenant mal operations trademark checklist --application TM-2026-001
npm run orgos -- --tenant mal operations trademark draft --application TM-2026-001
npm run orgos -- --tenant mal operations trademark draft --application TM-2026-001 --write
```

## ワークフロー（Phase 0）

1. **商標定義** — `marks.yaml` に標準文字または図形商標のメタを登録。図形は `records/trademark/` に見本（L2）。
2. **指定商品役務** — J-PlatPat 商品役務名検索で正式名称を確認し `goods-services.yaml` に記載。
3. **案件登録** — `trademark-registry.yaml` に `TM-*` 案件を追加。
4. **チェックリスト** — `trademark checklist` で法域 · 必須項目 · 見本要否を確認。
5. **ドラフト** — `trademark draft --write` が `docs/trademark/` に商標登録願 MD を生成。

## 委譲

社内決裁 → Secretary / REG-004 · 契約上の商標譲渡 → Contract · 費用計上 → Finance

## 禁止

- 先行商標調査未実施の **登録可能** 断定
- L2（個人住所 · 商標見本の秘匿情報）を tracked MD / チャットへ転記
- 特許庁オンライン出願への **自動送信**（Phase 0 禁止 · 人間提出）
