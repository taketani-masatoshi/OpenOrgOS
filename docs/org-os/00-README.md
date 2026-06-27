# docs/org-os — 組織 OS · 法域拡張

Steward OS の **法域（jurisdiction）· 表示言語（locale）· 法人形態** に関する設計文書。

**OpenOrgOS の位置づけ:** 組織**内部**管理 OS ではなく、組織**間**通信の **global protocol**。Core は **Org Event Model · identity exchange · authority delegation · auditability** の四つのみ。ビジネスロジック · 法解釈 · 組織行動は **national / domain committees**（法域 · 業種 adapter）に委譲。

## 設計原則（英語正本）

| 文書 | 内容 |
|------|------|
| [openorgos-core-philosophy.md](openorgos-core-philosophy.md) | **OpenOrgOS Core Philosophy** — inter-org protocol · kernel · adapters |
| [language-policy.md](language-policy.md) | **Language tiers** — Core EN · Strategic · Community-supported |
| [layer-mapping-steward-os.md](layer-mapping-steward-os.md) | 本リポジトリの 4 層対応 · Core drift 一覧 |
| [orgos-completion-plan.md](orgos-completion-plan.md) | **OrgOS 完成度向上計画** — ORG-C0–C5 |
| [orgos-interface-spec.md](orgos-interface-spec.md) | Implementation / Adapter / Wire 境界（草案） |
| [org-approval-schema.md](org-approval-schema.md) | **Org 承認根幹** — `scope: internal \| wire` · pending-approvals SoT |
| [inter-org-operator-model.md](inter-org-operator-model.md) | **Operator + CEO 承認ゲート** — Steward は組織間送信しない |
| [inter-org-two-org-demo.md](inter-org-two-org-demo.md) | **2 組織デモ** — mal ↔ southwood · `npm run demo:inter-org` |
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

完成度は [framework-assessment.md](../framework-assessment.md) §11 · バックログは [framework-backlog.md](../framework-backlog.md) Phase ORG-J8。
