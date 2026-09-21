# ADR 0081 — コネクタ／台帳のみ機能の完了線

## Status

Accepted · 2026-09-22

## Context

市場機能のうち `fit: connector`（要コネクタ）と `fit: ledger_only`（台帳のみ）は、ライブ外部 I/O（OCR · NTA · STT · GPS · 地図タイル）を含む要望と、テナント YAML で足りる代替が混在する。Propose depth uplift の過程で「コネクタ待ち」と誤読され、実装バックログに残り続けた。

## Decision

1. **方針内の完了線はオフライン／台帳代替まで。** テキスト・ファイル入力、catalog YAML、`field_ops` / `retail` / `jobs` 台帳による ProposeReport（depth L2）が載れば doctrine 完成とする。
2. **ライブ外部は完了条件に含めない。**
   - **台帳のみ:** GPS 軌跡・地図タイル・現在地座標は **永久拒否**（Core propose 面に載せない）。
   - **要コネクタ:** ライブ OCR / NTA API / ライブ STT は **別コネクタ作業**に隔離する。Core の propose uplift をブロックしない。
3. **コネクタ／台帳のみの件数は「未実装」ではない。** キャンバス上の当該枠は「外部半分の扱いが決まっている機能数」であり、次に実装するキューではない。

## Consequences

- `invoice-qualified intake` · `sales bant` · `field interface` · `field dispatch` · `client_portal track` は方針内完了（shipped · L2）のまま。
- ライブ OCR / STT / GPS / 地図を Core CLI に足す PR は本 ADR に反する（コネクタ／外部プロダクトとして別途起票する）。
- feature-gap の「完成」は無人実行をしない完了線のまま。完成 ≠ ライブコネクタ実装。

## Related

- [0079](0079-module-ai-permission-declaration.md) — AI 権限と propose-only
- キャンバス: `ooo-cli-agent-module-feasibility` · `ooo-feature-gap-vs-market`
