# ISO 内部監査レポート — IAR-1788005425323-amg5qyy2

**日時:** 2026-08-29T12:10:25.323Z
**テナント:** mal
**実施:** internal_audit（決定論検査 · 人間署名ではない）
**対象規格:** ISO-21401, ISO-37000

## 現状

| 総合 | 検査件数 | 適合 | 観察 | 不適合 | マップ欠落 |
|------|----------|------|------|--------|------------|
| 不適合 | 35 | 7 | 0 | 28 | 0 |

前回 IAR-1788004404915-xzbf0cc0（2026-08-29）総合 nonconform · 不適合 28 件。

## 適合状況（規格別）

| 規格 | 件数 | 適合 | 観察 | 不適合 | マップ欠落 |
|------|------|------|------|--------|------------|
| ISO-21401 | 24 | 7 | 0 | 17 | 0 |
| ISO-37000 | 11 | 0 | 0 | 11 | 0 |

## 問題点

| CTL | 規格 | 内容 | 担当 |
|-----|------|------|------|
| CTL-CORE-risk-approach | ISO-21401 6.1 | 証拠パス未充足: docs/compliance/iso/ISO-21401/risk-opportunities.csv（様式が未記入） | compliance |
| CTL-CORE-operation | ISO-21401 8.1 | 現在 L0 · 目標 L2 | operations |
| CTL-CORE-management-review | ISO-21401 9.3 | 現在 L2 · 目標 L3 | compliance |
| CTL-CORE-corrective-action | ISO-21401 10.2 | 証拠パス未充足: docs/compliance/iso/ISO-21401/corrective-actions.csv（様式が未記入） | quality_assurance |
| CTL-21401-hygiene | ISO-21401 8.1 | 現在 L0 · 目標 L3 | operations |
| CTL-21401-env-aspects | ISO-21401 6.1 | 現在 L0 · 目標 L2 | esg_sustainability |
| CTL-21401-env-resources | ISO-21401 9.1 | 現在 L0 · 目標 L3 | esg_sustainability |
| CTL-21401-env-waste | ISO-21401 8.1 | 現在 L0 · 目標 L2 | esg_sustainability |
| CTL-21401-env-purchasing | ISO-21401 8.1 | 現在 L0 · 目標 L2 | procurement |
| CTL-21401-soc-community | ISO-21401 4.2 | 現在 L0 · 目標 L2 | pr_communications |
| CTL-21401-soc-heritage | ISO-21401 8.1 | 現在 L0 · 目標 L2 | esg_sustainability |
| CTL-21401-soc-protection | ISO-21401 8.1 | 現在 L0 · 目標 L2 | compliance |
| CTL-21401-soc-accessibility | ISO-21401 8.1 | 現在 L0 · 目標 L2 | operations |
| CTL-21401-eco-local | ISO-21401 8.1 | 現在 L0 · 目標 L2 | procurement |
| CTL-21401-guest-safety | ISO-21401 8.1 | 現在 L0 · 目標 L3 | operations |
| CTL-21401-guest-communication | ISO-21401 7.4 | 現在 L0 · 目標 L2 | pr_communications |
| CTL-21401-worker-welfare | ISO-21401 7.1 | 現在 L0 · 目標 L2 | human_resources |
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

- **P1 CTL-21401-guest-safety**（ゲストの安全（消防設備・避難・緊急時対応））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/competence/研修実施記録.md に残す。
- **P1 CTL-21401-hygiene**（衛生・清掃基準と委託先の監督）: 成熟度を目標まで上げ、運用記録を docs/properties/PROP-002-kamezawa/operations/records/ に残す。
- **P1 CTL-21401-soc-protection**（差別的取扱いの禁止と児童・青少年の保護）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/guest-protection-policy.md に残す。
- **P1 CTL-21401-worker-welfare**（従業員の労働安全衛生と就業条件）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/worker-welfare.md に残す。
- **P2 CTL-21401-env-aspects**（著しい環境側面の特定と目標設定）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/environmental-aspects.csv に残す。
- **P2 CTL-21401-env-resources**（エネルギー・水の使用量の測定と削減）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/kpi-log.csv に残す。
- **P2 CTL-21401-env-waste**（廃棄物の分別・減量と事業系ごみの適正処理）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/kpi-log.csv に残す。
- **P2 CTL-21401-soc-community**（地域・近隣ステークホルダーとの関係管理）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/stakeholder-register.csv に残す。
- **P2 CTL-CORE-corrective-action**（不適合及び是正処置）: 証拠ファイルを用意する: docs/compliance/iso/ISO-21401/corrective-actions.csv
- **P2 CTL-CORE-operation**（運用の計画及び管理）: 成熟度を目標まで上げ、運用記録を docs/company/regulations/shukuhaku-unyo-kisoku.md に残す。
- **P2 CTL-CORE-risk-approach**（リスク及び機会への取組み）: 証拠ファイルを用意する: docs/compliance/iso/ISO-21401/risk-opportunities.csv
- **P3 CTL-21401-eco-local**（地域経済への貢献（地域調達・地域雇用））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/local-economy-log.csv に残す。
- **P3 CTL-21401-env-purchasing**（環境配慮型の調達（洗剤・アメニティ・消耗品））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/sustainable-purchasing.md に残す。
- **P3 CTL-21401-guest-communication**（サステナビリティ情報の提供と表示の実態一致）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/guest-communication.md に残す。
- **P3 CTL-21401-soc-accessibility**（アクセシビリティ対応と正確な情報提供）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/accessibility-statement.md に残す。
- **P3 CTL-21401-soc-heritage**（地域文化・景観への配慮と地域資源の活用）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/socio-cultural-plan.md に残す。
- **P3 CTL-37000-P-01**（Purpose — 組織の目的の明示）: 成熟度を目標まで上げ、運用記録を data/plans/business-plan.yaml · docs/company/mission-vision.md に残す。
- **P3 CTL-37000-P-02**（Value generation — 価値創出の計画）: 成熟度を目標まで上げ、運用記録を data/plans/business-plan.yaml · data/plans/revenue-plan.yaml に残す。
- **P3 CTL-37000-P-03**（Strategy — 戦略と計画ゲート）: 成熟度を目標まで上げ、運用記録を data/plans/business-plan.yaml に残す。
- **P3 CTL-37000-P-04**（Oversight — 統治機関の監督記録）: 成熟度を目標まで上げ、運用記録を data/company-events.yaml · data/governance/meetings.yaml に残す。
- **P3 CTL-37000-P-05**（Accountability — 権限の文書化と職務分離）: 成熟度を目標まで上げ、運用記録を data/org/operators.yaml · data/org/governance-policy.yaml に残す。
- **P3 CTL-37000-P-06**（Stakeholder engagement — ステークホルダーの識別）: 成熟度を目標まで上げ、運用記録を data/company.yaml · data/governance/register.yaml に残す。
- **P3 CTL-37000-P-07**（Leadership — 倫理的で実効ある指導）: 成熟度を目標まで上げ、運用記録を data/org/operators.yaml · data/org/governance-policy.yaml に残す。
- **P3 CTL-37000-P-08**（Data and decisions — データに基づく意思決定）: 成熟度を目標まで上げ、運用記録を data/analytics/metrics.yaml · docs/reports/dashboard に残す。
- **P3 CTL-37000-P-09**（Risk governance — リスクの統治）: 成熟度を目標まで上げ、運用記録を data/risk/register.yaml に残す。
- **P3 CTL-37000-P-10**（Social responsibility — 社会的責任）: 成熟度を目標まで上げ、運用記録を docs/company/regulations/kankyo-energy-kanri-kisoku.md · docs/esg/00-README.md に残す。
- **P3 CTL-37000-P-11**（Viability and performance over time — 存続と長期業績）: 成熟度を目標まで上げ、運用記録を data/plans/business-plan.yaml · data/plans/debt-plan.yaml に残す。
- **P3 CTL-CORE-management-review**（マネジメントレビュー）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/management-review-fy2026-template.md に残す。

P1 は人の安全・法令上の要求で待てないもの、P2 は他が依存する土台、P3 は改善・報告。

## 注記

- 本レポートは control-map と証拠パスの決定論検査である。ISO 公式本文の都度解釈ではない。
- 条項番号はパックが持つ対応表であり、既定では未検証。状態は `orgos iso clauses` で確認する。
- 認定機関の証明書は出さない。署名は人間が行う。
- 監査ログ: `data/compliance/iso-internal-audit.jsonl`
