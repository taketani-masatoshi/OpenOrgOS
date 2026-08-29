# ISO 37000 自己宣言（テンプレート）

**組織:** {{company_name}}  
**宣言日:** {{declared_at}}  
**署名者:** {{signatory_role}} / {{signatory_name}}  
**状態:** {{status}}

## 宣言の性質

本宣言は ISO 37000:2021（組織のガバナンス — Guidance）を参照し、OpenOrgOS（OrgOS）が提供する統治・承認・監査の統制面を運用していることを **組織自らが表明** するものである。

- **第三者認証ではない**（ISO 37301 等の認証スキームとは別）
- 根拠は `orgos governance principles status` の決定論的点検および下記証拠
- 虚偽記載・未充足での自己宣言は行わない

## 適用する原則（ISO 37000:2021）

| ID | 原則 | 充足 |
| --- | --- | --- |
| P-01 | Purpose | {{P-01}} |
| P-02 | Value generation | {{P-02}} |
| P-03 | Strategy | {{P-03}} |
| P-04 | Oversight | {{P-04}} |
| P-05 | Accountability | {{P-05}} |
| P-06 | Stakeholder engagement | {{P-06}} |
| P-07 | Leadership | {{P-07}} |
| P-08 | Data and decisions | {{P-08}} |
| P-09 | Risk governance | {{P-09}} |
| P-10 | Social responsibility | {{P-10}} |
| P-11 | Viability and performance over time | {{P-11}} |

## 主要証拠（テナント相対）

- `data/plans/business-plan.yaml` · `docs/company/mission-vision.md`
- `data/org/operators.yaml` · `data/org/governance-policy.yaml`
- `data/company-events.yaml` · `data/governance/meetings.yaml`
- `data/risk/register.yaml`
- `steward/rules/governance-principles.md`（フレームワーク正本）

## 見直し

`review_cycle` に従い少なくとも年1回、`orgos governance principles status` を再実行する。
