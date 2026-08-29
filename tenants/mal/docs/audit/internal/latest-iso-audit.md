# ISO 内部監査レポート — IAR-1787998935268-cn6djg3u

**日時:** 2026-08-29T10:22:15.268Z
**テナント:** mal
**実施:** internal_audit（決定論検査 · 人間署名ではない）
**対象規格:** ISO-13485, ISO-21401, ISO-37000

## 現状

| 総合 | 検査件数 | 適合 | 観察 | 不適合 | マップ欠落 |
|------|----------|------|------|--------|------------|
| 不適合 | 28 | 9 | 0 | 19 | 0 |

前回 IAR-1787995251819-mxdbh7hk（2026-08-29）総合 nonconform · 不適合 11 件。

## 適合状況（規格別）

| 規格 | 件数 | 適合 | 観察 | 不適合 | マップ欠落 |
|------|------|------|------|--------|------------|
| ISO-13485 | 15 | 7 | 0 | 8 | 0 |
| ISO-21401 | 2 | 2 | 0 | 0 | 0 |
| ISO-37000 | 11 | 0 | 0 | 11 | 0 |

## 問題点

| CTL | 規格 | 内容 | 担当 |
|-----|------|------|------|
| CTL-CORE-management-review | ISO-13485 5.6 | 現在 L2 · 目標 L3 | compliance |
| CTL-13485-4.2.2 | ISO-13485 4.2.2 | 現在 L0 · 目標 L2 | medical_device_regulatory |
| CTL-13485-7.3 | ISO-13485 7.3 | 現在 L0 · 目標 L2 | engineering |
| CTL-13485-7.4 | ISO-13485 7.4 | 現在 L0 · 目標 L2 | medical_device_regulatory |
| CTL-13485-7.5 | ISO-13485 7.5 | 現在 L0 · 目標 L2 | medical_device_regulatory |
| CTL-13485-7.5.9 | ISO-13485 7.5.9 | 現在 L0 · 目標 L2 | medical_device_regulatory |
| CTL-13485-8.2.2 | ISO-13485 8.2.2 | 現在 L0 · 目標 L2 | medical_device_regulatory |
| CTL-13485-8.2.3 | ISO-13485 8.2.3 | 現在 L0 · 目標 L3 | medical_device_regulatory |
| CTL-37000-P-01 | ISO-37000 purpose | 現在 L0 · 目標 L2 | executive_steward |
| CTL-37000-P-02 | ISO-37000 value_generation | 現在 L0 · 目標 L2 | finance |
| CTL-37000-P-03 | ISO-37000 strategy | 現在 L0 · 目標 L2 | executive_steward |
| CTL-37000-P-04 | ISO-37000 oversight | 現在 L0 · 目標 L2 | corporate_governance |
| CTL-37000-P-05 | ISO-37000 accountability | 現在 L0 · 目標 L2 | compliance |
| CTL-37000-P-06 | ISO-37000 stakeholder_engagement | 現在 L0 · 目標 L2 | executive_steward |
| CTL-37000-P-07 | ISO-37000 leadership | 現在 L0 · 目標 L2 | executive_steward |
| CTL-37000-P-08 | ISO-37000 data_and_decisions | 現在 L0 · 目標 L2 | executive_steward |
| CTL-37000-P-09 | ISO-37000 risk_governance | 現在 L0 · 目標 L2 | compliance |
| CTL-37000-P-10 | ISO-37000 social_responsibility | 現在 L0 · 目標 L2 | compliance |
| CTL-37000-P-11 | ISO-37000 viability_and_performance | 現在 L0 · 目標 L2 | finance |

## 課題

観察・マップ欠落なし。

## 改善提案

- **CTL-CORE-management-review**（マネジメントレビュー）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/management-review-fy2026-template.md · docs/medical-device/qms/ に残す。
- **CTL-13485-4.2.2**（品質マニュアル）: 成熟度を目標まで上げ、運用記録を docs/medical-device/qms/ に残す。
- **CTL-13485-7.3**（設計・開発）: 成熟度を目標まで上げ、運用記録を docs/medical-device/qms/ に残す。
- **CTL-13485-7.4**（購買）: 成熟度を目標まで上げ、運用記録を docs/medical-device/qms/ に残す。
- **CTL-13485-7.5**（製造及びサービス提供）: 成熟度を目標まで上げ、運用記録を data/medical-device/ledgers/manufacturing-batch-records.yaml に残す。
- **CTL-13485-7.5.9**（トレーサビリティ）: 成熟度を目標まで上げ、運用記録を data/medical-device/ledgers/distribution-records.yaml に残す。
- **CTL-13485-8.2.2**（苦情処理）: 成熟度を目標まで上げ、運用記録を data/medical-device/ledgers/complaint-records.yaml に残す。
- **CTL-13485-8.2.3**（規制当局への報告）: 成熟度を目標まで上げ、運用記録を data/medical-device/ledgers/adverse-event-records.yaml に残す。
- **CTL-37000-P-01**（Purpose — 組織の目的の明示）: 成熟度を目標まで上げ、運用記録を data/plans/business-plan.yaml · docs/company/mission-vision.md に残す。
- **CTL-37000-P-02**（Value generation — 価値創出の計画）: 成熟度を目標まで上げ、運用記録を data/plans/business-plan.yaml · data/plans/revenue-plan.yaml に残す。
- **CTL-37000-P-03**（Strategy — 戦略と計画ゲート）: 成熟度を目標まで上げ、運用記録を data/plans/business-plan.yaml に残す。
- **CTL-37000-P-04**（Oversight — 統治機関の監督記録）: 成熟度を目標まで上げ、運用記録を data/company-events.yaml · data/governance/meetings.yaml に残す。
- **CTL-37000-P-05**（Accountability — 権限の文書化と職務分離）: 成熟度を目標まで上げ、運用記録を data/org/operators.yaml · data/org/governance-policy.yaml に残す。
- **CTL-37000-P-06**（Stakeholder engagement — ステークホルダーの識別）: 成熟度を目標まで上げ、運用記録を data/company.yaml · data/governance/register.yaml に残す。
- **CTL-37000-P-07**（Leadership — 倫理的で実効ある指導）: 成熟度を目標まで上げ、運用記録を data/org/operators.yaml · data/org/governance-policy.yaml に残す。
- **CTL-37000-P-08**（Data and decisions — データに基づく意思決定）: 成熟度を目標まで上げ、運用記録を data/analytics/metrics.yaml · docs/reports/dashboard に残す。
- **CTL-37000-P-09**（Risk governance — リスクの統治）: 成熟度を目標まで上げ、運用記録を data/risk/register.yaml に残す。
- **CTL-37000-P-10**（Social responsibility — 社会的責任）: 成熟度を目標まで上げ、運用記録を docs/company/regulations/kankyo-energy-kanri-kisoku.md · docs/esg/00-README.md に残す。
- **CTL-37000-P-11**（Viability and performance over time — 存続と長期業績）: 成熟度を目標まで上げ、運用記録を data/plans/business-plan.yaml · data/plans/debt-plan.yaml に残す。

## 注記

- 本レポートは control-map と証拠パスの決定論検査である。ISO 公式本文の都度解釈ではない。
- 認定機関の証明書は出さない。署名は人間が行う。
- 監査ログ: `data/compliance/iso-internal-audit.jsonl`
