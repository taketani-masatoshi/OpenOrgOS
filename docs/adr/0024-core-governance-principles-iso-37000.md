# ADR 0024 — ISO 37000 11原則のコア組み込みと自己宣言

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** OpenOrgOS maintainers

## Context

予算委譲・RBAC・承認・監査ログは個別にあるが、ISO 37000（組織のガバナンス — Guidance）への機械可読な対応が現行 Operator リポジトリに無かった。Community は自己宣言経路を案内していたが、パックと本文が未接続だった。

ISO 37000 は認証規格ではない。ISO 37001（贈収賄）および ISO 37301（CMS）とは別物として扱う。

## Decision

1. **11原則**（P-01…P-11）を `steward/rules/governance-principles.md` に正本化する。旧草案の予算中心 GP-01…12 は、37000 の幅を覆わないため採用しない。
2. 各原則は **既存コア実装面** へマッピングする。新規の並行ロジックは作らない。
3. **ISO-37000** パック（`steward/standards/iso/ISO-37000/`）と `control-map.yaml` で原則 ↔ 証拠パスを結ぶ。
4. テナントは `orgos governance principles init` で自己宣言ドラフトを生成する。署名は人間のみ（`declare`）。**認証ではない。**
5. `status` はファイル存在に加え、purpose の実文言と職務分離（auditor または補償統制）を点検する。プレースホルダでは `ready` にしない。
6. `orgos tenant init` は目的ドラフトと宣言ドラフトを書く。

## Consequences

### Positive

- 国際ガイダンスと OrgOS 実装の対応が一覧できる
- 初期化後すぐに自己宣言の体裁が揃う
- 37001 / 37301 を後から載せてもコアと衝突しない

### Negative / risks

- 自己宣言は「統制面が揃っている」ことの表明であり、第三者保証ではない
- 小規模テナントでは職務分離を補償統制（ceo/auditor 兼任禁止）で代替する

## Related

- [0027-budget-envelope-governance.md](0027-budget-envelope-governance.md)
- [0038-human-approval-context.md](0038-human-approval-context.md)
- [governance-principles.md](../org-os/governance-principles.md)
