# Skill: language_bridge（言語ブリッジ · 議事録）

## 目的

ユーザー言語とシステム言語が異なるとき、議事録 MD の **正本言語** を誤らない。

## Step 0 — 解決確認

```bash
npm run orgos -- operations locale-bridge show
npm run orgos -- operations locale-bridge validate
```

## Step 1 — 起草

- `layout: system_primary` → `[SYSTEM]` セクションを先に system language で埋める
- `layout: bilingual` → 両セクション必須
- frontmatter: `npm run orgos -- operations locale-bridge header --doc board_minutes`

## 禁止

- 正本段落を user language のみで完結させない（system ≠ user 時）
- 翻訳を Agent 確定としない — 段承認
