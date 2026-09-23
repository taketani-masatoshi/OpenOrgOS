# Skill: jp_patent_draft（特許出願書類ドラフト）

**Module:** `jp_patent_application` · **Agent:** Intellectual Property · **runtime:** `cli`
**Path:** `steward/jurisdiction-packs/JP/modules/jp_patent_application/skills/jp_patent_draft.md`
**Cursor（任意）:** `@steward/jurisdiction-packs/JP/modules/jp_patent_application/skills/jp_patent_draft.md`

## 入力

- `data/ip/patent/patent-registry.yaml` — 案件（出願人は company · 発明者は stakeholder_id のみ）
- `data/ip/patent/specifications/<id>.yaml` — 明細書・特許請求の範囲・要約書の入力
- `data/ip/patent/sources.yaml` — 書式カタログ · 確認済み料金

## 手順

1. `npm run orgos -- --tenant demo operations patent validate`
2. `npm run orgos -- --tenant demo operations patent checklist --application PAT-2026-001` — `ng` を解消し、`needs_review` は人間が確認
3. `npm run orgos -- --tenant demo operations patent draft --application PAT-2026-001`（標準出力で確認）
4. `... draft --application PAT-2026-001 --write` → `docs/ip/patent/PAT-2026-001/` に 4 ファイル
5. 発明者の氏名・住所など `（要記入）` 欄は人間が L2 正本から転記し、弁理士等が最終確認して電子出願ソフトで提出

## 出力

`tokkyo-gan.md` · `meisaisho.md` · `tokkyo-seikyu-no-hani.md` · `yoyakusho.md`（非提出稿）

## 禁止

- 特許性・登録可能性の断定 · 先行技術調査の代替
- L2（発明者住所等）の tracked 転記 · 特許庁への自動送信
