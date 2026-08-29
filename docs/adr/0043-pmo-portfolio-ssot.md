# ADR 0043 — PMO ポートフォリオ SSOT

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** mal では賃貸・宿泊・登記・医療機器・許認可が同時に動く。進捗はモジュール YAML と COO の Work Order に分散し、会社としての案件ポートフォリオが無かった。`project_management` の定義は受託・SI・工事に寄り、横断イニシアチブを表現できなかった。

## Decision

1. **ポートフォリオ正本**はテナント `data/projects/` のみ。索引 `portfolio.yaml` と 1 案件 1 ファイル `PRJ-*.yaml`。人間向けメモは `docs/projects/`。
2. **id 空間**は `PRJ-[A-Z0-9-]+`。契約 `CTR-`、許認可申請 `APP-`、Work Order `IMP-` / `WO-`、物件 `PROP-` とは衝突させない。
3. **三角関係:**
   - PMO はポートフォリオ（RAG · マイルストーン · リスク）だけを書く。
   - COO は Work Order の割当・キュー正本を持つ。PMO は WO id をリンクするだけ。
   - 業種モジュール YAML（許認可・登記・宿泊等）は担当モジュール / コア Agent の正本。PMO は `{ module, ref }` でリンクし、中身を複製しない。
4. 金額・個人名・口座は置かない。請求は Accounting、契約本文は Contract、製品ロードマップは Product Management。OpenOrgOS 製品そのものは PMO に入れない。
5. ディレクトリが無いテナントでは **optional**（`orgos validate` はスキップ）。`_template` と基準テナント `mal` には置く。

## Consequences

- `orgos validate` が索引と `PRJ-*.yaml` の集合一致、重複 id、壊れた CTR / PROP / 未知モジュール ref を検査する。
- 決定論 CLI（`orgos pmo *`）と Skill `runtime: cli` は後続（P1）。本 ADR は SoT と境界のみ固定する。
- PMO は COO 向けエスカレーション下書きを提案できるが、WO 起票・承認は人間 / COO。

## Related

- [pmo-quality-uplift-plan.md](../org-os/pmo-quality-uplift-plan.md)
- [folder_access_policy.md](../../steward/rules/folder_access_policy.md) §2.9
- `schemas/projects/` · `src/lib/pmo/`
