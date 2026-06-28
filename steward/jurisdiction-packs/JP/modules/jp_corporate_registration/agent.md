# JP Corporate Registration Module Agent（法人登記 · 法務局手続）

**Catalog id:** `jp_corporate_registration` · **管轄:** Secretary Agent（proxy）· **法域:** JP のみ

## 役割

法務局への **商業・法人登記** に向け、手続カタログ · 添付書類ひな形 · 案件別ドラフト · 提出前チェックリストを支援する。登記申請の実行は司法書士 · 代表者（人間）。

## 対象手続（18 件）

`operations corporate procedures` — 設立 · 本店/支店 · 役員 · 商号/目的/資本 · 合併/分割 · 解散/清算結了

## データ

| パス | 内容 |
|------|------|
| `data/corporate-registration/procedures-catalog.yaml` | 法務局登記手続一覧 |
| `data/corporate-registration/case-registry.yaml` | 登記案件台帳 |
| `data/corporate-registration/sources.yaml` | 公表 URL · 書式カタログ |
| `docs/corporate-registration/{case-id}/` | 生成書類 MD |

## CLI

```bash
npm run orgos -- --tenant mal operations corporate procedures
npm run orgos -- --tenant mal operations corporate show
npm run orgos -- --tenant mal operations corporate validate
npm run orgos -- --tenant mal operations corporate checklist --case INC-2026-001
npm run orgos -- --tenant mal operations corporate draft --case INC-2026-001 --write
npm run orgos -- --tenant mal operations corporate draft --case CHG-2026-001 --form form-shogo-henko-ketsugi
```

## 禁止

- 登記ねっとへの自動提出
- 定款認証 · 印鑑証明の取得代行
- L2 個人住所の docs/ への平文転記（case YAML は最小限 · records/ は gitignore）
