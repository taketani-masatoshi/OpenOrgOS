# Skill: jp_trademark_application（商標出願 · 書類作成）

**Module:** `jp_trademark_application` · **Agent:** Compliance（proxy）

## 手順

1. `seed/sources.yaml.example` の公表 URL（特許庁 · INPIT）を確認
2. `marks.yaml` · `goods-services.yaml` を J-PlatPat 正式名称で整備
3. `operations trademark validate` → `checklist` → `draft --write`
4. 生成 MD を人間がレビュー後、オンライン出願ソフトへ転記

## 禁止

- 登録可能の断定 · L2 商標見本の tracked 転記 · 自動出願送信
