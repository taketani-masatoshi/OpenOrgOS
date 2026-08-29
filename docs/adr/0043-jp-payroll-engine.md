# ADR 0043: JP 給与計算エンジン

## Status

Accepted · 2026-08-24

## Decision

- `jp_payroll` モジュール — 料率・税額表は年度別 seed YAML
- 個人別支給明細は L2（gitignore）· tracked は集計のみ
- `orgos operations payroll calc` / `post-journal`

## Out of scope

- 賞与・年末調整の完全自動化（Phase 4 以降拡張）
