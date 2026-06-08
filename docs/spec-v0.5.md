# Steward OS — Specification v0.5

> **正本:** L3 製品深度 · 自動化骨格。v0.4 は [spec-v0.4.md](spec-v0.4.md)。

## v0.5 変更概要

| 領域 | 内容 |
|------|------|
| **Readiness 3 tier** | skeleton · activation_ready · production_ready · `modules check` tier 別 |
| **activation_ready** | 13 モジュール activation seed 一式 |
| **hospitality billing** | invoice generate  parity · [hospitality-invoice.md](spec/hospitality-invoice.md) |
| **Skill registry** | [steward/skills/registry.yaml](../steward/skills/registry.yaml) · cli \| cursor-only |
| **Pipeline** | `steward pipeline run daily` = validate → ops daily → dashboard |
| **npm run daily** | check + pipeline run daily |
| **map tree** | `steward map tree` · dependency-graph · enabled modules |
| **Agent routing (Phase 1)** | [steward/routing/registry.yaml](../steward/routing/registry.yaml) · `steward route` · classification access gate |
| **Delegation / Work Order** | `steward escalate` · [delegate_implementation.md](../steward/orchestrators/delegate_implementation.md) · `task_type: implement` |

## L3 達成 DoD（v0.5）

| ID | 定義 | 確認 |
|----|------|------|
| L3-1 | readiness 3 tier · modules check | `modules check --all` |
| L3-2 | hospitality production_ready + invoice seed | `modules check hospitality` |
| L3-3 | 13 activation_ready modules | readiness.yaml |
| L3-4 | Skill registry 14+ · skills list | `steward skills list` |
| L3-5 | pipeline run daily | `steward pipeline run daily` |
| L3-6 | npm run daily | package.json |
| L3-7 | map tree | `steward map tree` |

## 関連

- [framework-assessment.md](framework-assessment.md)
- [framework-backlog.md](framework-backlog.md)
