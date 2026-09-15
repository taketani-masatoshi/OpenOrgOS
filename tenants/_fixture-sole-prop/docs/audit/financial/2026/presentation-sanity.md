# 表示健全性 — 2026

as_of: 2026-12-31 · sole_prop: yes
journal_hash: `91c5f87101c6…`
total_assets: -50,000
事業主貸: —

## Findings

| code | level | message |
|------|-------|---------|
| presentation_total_jump_journals_unchanged | warning | 仕訳ハッシュ不変なのに資産合計が変化（baseline -40000 → -50000）。表示再分類の疑い |

機械ルールのみ（LLM 判定なし）。baseline 更新は CLI `--update-baseline` のみ（workpapers は非更新）。