# docs/org-os — 組織 OS · 法域拡張

**用語正本:** [orgos-vocabulary.md](orgos-vocabulary.md) — **OrgOS = 製品** · **Steward Agent = 経営統括 Agent** · Core · Wire · Witness

**OrgOS（組織 OS）** = 製品全体（旧ドキュメントの「Steward OS 製品」に相当）。  
本リポジトリ `OS_Steward` / npm `orgos-reference` は **OrgOS の参照実装** — CLI **`orgos`**（旧 `steward` 非推奨 · [cli-migration.md](cli-migration.md)）。

## 設計原則（英語正本）

| 文書 | 内容 |
|------|------|
| [orgos-vocabulary.md](orgos-vocabulary.md) | **用語正本** — OrgOS · Core · Wire · Witness · Agent |
| [openorgos-core-philosophy.md](openorgos-core-philosophy.md) | **OpenOrgOS Core Philosophy** — inter-org protocol · kernel · adapters |
| [language-policy.md](language-policy.md) | **Language tiers** — Core EN · Strategic · Community-supported |
| [layer-mapping-steward-os.md](layer-mapping-steward-os.md) | 本リポジトリの 4 層対応 · Core drift 一覧 |
| [orgos-completion-plan.md](orgos-completion-plan.md) | **OrgOS 完成度向上計画** — ORG-C0–C5 |
| [orgos-scoring-methodology.md](orgos-scoring-methodology.md) | **採点正本** — チェックリスト vs 厳格 · 批判対応マップ |
| [orgos-interface-spec.md](orgos-interface-spec.md) | Implementation / Adapter / Wire 境界（草案） |
| [org-approval-schema.md](org-approval-schema.md) | **Org 承認根幹** — `scope: internal \| wire` · pending-approvals SoT |
| [inter-org-operator-model.md](inter-org-operator-model.md) | **Operator + CEO 承認ゲート** — Steward は組織間送信しない |
| [inter-org-two-org-demo.md](inter-org-two-org-demo.md) | **2 組織デモ** — mal ↔ southwood · `npm run demo:inter-org` |
| [wire-console-plan.md](wire-console-plan.md) | **Wire Console** — SPA + localhost BFF · outbox/inbox 可視化 · 運用 UI チケット |
| [inter-org-three-org-demo.md](inter-org-three-org-demo.md) | **3-org Wire デモ** — CLI + Console 手順 |
| [resilience-stack.md](resilience-stack.md) | **Resilience R1–R4** — relay worker · multipath · Org C trust PKI · SLA |

## 読む順

| 順 | 文書 | 内容 |
|----|------|------|
| 0 | [openorgos-core-philosophy.md](openorgos-core-philosophy.md) | 何を Core に置くか · 判断基準 |
| 0b | [orgos-completion-plan.md](orgos-completion-plan.md) | **完成度向上計画** — 単独 OrgOS · 形式統一 · ORG-C0–C5 |
| 1 | [tjs-11-target-jurisdictions.md](tjs-11-target-jurisdictions.md) | **製品ゴール** — TJS-11 分母 · pack_ready DoD · 三軸評価 |
| 2 | [jurisdiction-pack-contract.md](jurisdiction-pack-contract.md) | テナント bind · pack 構成 |
| 3 | [jurisdiction-matrix.md](jurisdiction-matrix.md) | Corporate Core 写像 · 調査表 |
| 4 | [jurisdiction-oss-governance.md](jurisdiction-oss-governance.md) | OSS 分離 · CODEOWNERS |

## 実装正本

| パス | 役割 |
|------|------|
| `steward/jurisdictions/` | 索引 · countries.yaml · packs.lock |
| `steward/jurisdiction-packs/` | bundled pack 実体 |
| `steward/locale/registry.yaml` | 表示言語（法域と独立） |
| `src/lib/jurisdiction.ts` · `locale.ts` | 解決ロジック |

## 評価

完成度は [framework-assessment.md](../framework-assessment.md) §13 · 採点正本 [orgos-scoring-methodology.md](orgos-scoring-methodology.md) · バックログ [framework-backlog.md](../framework-backlog.md) Phase ORG-C。
