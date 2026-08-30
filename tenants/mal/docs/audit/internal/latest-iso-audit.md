# ISO 適合性の事前検査 — IAR-1788047544962-uuvmgdq6

**日時:** 2026-08-29T23:52:24.962Z
**テナント:** mal
**実施:** internal_audit（決定論検査 · 人間署名ではない）
**位置づけ:** 本検査は ISO 19011 の内部監査ではない。証拠の存在と記録の仕様適合を機械的に確認するもので、要求事項ごとの判定は `orgos iso audit plan create` 以降で監査員が行う。
**対象規格:** ISO-13485, ISO-14001, ISO-20000, ISO-21401, ISO-22301, ISO-27001, ISO-37000, ISO-37001, ISO-45001, ISO-50001, ISO-9001

## 現状

| 総合 | 検査件数 | 適合 | 観察 | 不適合 | マップ欠落 |
|------|----------|------|------|--------|------------|
| 不適合 | 71 | 5 | 2 | 64 | 0 |

前回 IAR-1788044344809-isbvj40y（2026-08-29）総合 nonconform · 不適合 64 件。

## 適合状況（規格別）

| 規格 | 件数 | 適合 | 観察 | 不適合 | マップ欠落 |
|------|------|------|------|--------|------------|
| ISO-13485 | 15 | 3 | 2 | 10 | 0 |
| ISO-14001 | 6 | 1 | 0 | 5 | 0 |
| ISO-20000 | 5 | 0 | 0 | 5 | 0 |
| ISO-21401 | 14 | 1 | 0 | 13 | 0 |
| ISO-22301 | 4 | 0 | 0 | 4 | 0 |
| ISO-27001 | 2 | 0 | 0 | 2 | 0 |
| ISO-37000 | 11 | 0 | 0 | 11 | 0 |
| ISO-37001 | 5 | 0 | 0 | 5 | 0 |
| ISO-45001 | 5 | 0 | 0 | 5 | 0 |
| ISO-50001 | 4 | 0 | 0 | 4 | 0 |

## 問題点

| CTL | 規格 | 内容 | 併記 | 担当 |
|-----|------|------|------|------|
| CTL-CORE-risk-approach | ISO-13485 7.1 | 証拠パス未充足: docs/compliance/iso/ISO-21401/risk-opportunities.csv（様式が未記入）, docs/compliance/iso/ISO-9001/risk-opportunities.csv（未作成） | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/risk-opportunities.csv: 1 件の不備, docs/compliance/iso/ISO-27001/risk-register.csv: 3 件の不備, docs/compliance/iso/ISO-9001/risk-opportunities.csv: 1 件の不備 | compliance |
| CTL-CORE-operation | ISO-14001 8.1 | 現在 L0 · 目標 L2 | — | operations |
| CTL-CORE-management-review | ISO-13485 5.6 | 現在 L2 · 目標 L3 | — | compliance |
| CTL-CORE-corrective-action | ISO-13485 8.5.2 | 証拠パス未充足: docs/compliance/iso/ISO-21401/corrective-actions.csv（様式が未記入）, docs/compliance/iso/ISO-9001/nonconformance-log.csv（未作成） | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-9001/nonconformance-log.csv: 1 件の不備 | quality_assurance |
| CTL-13485-4.2.2 | ISO-13485 4.2.2 | 現在 L0 · 目標 L2 | — | medical_device_regulatory |
| CTL-13485-7.3 | ISO-13485 7.3 | 現在 L0 · 目標 L2 | — | engineering |
| CTL-13485-7.4 | ISO-13485 7.4 | 現在 L0 · 目標 L2 | — | medical_device_regulatory |
| CTL-13485-7.5 | ISO-13485 7.5 | 現在 L0 · 目標 L2 | — | medical_device_regulatory |
| CTL-13485-7.5.9 | ISO-13485 7.5.9 | 現在 L0 · 目標 L2 | — | medical_device_regulatory |
| CTL-13485-8.2.2 | ISO-13485 8.2.2 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — data/medical-device/ledgers/complaint-records.yaml: 1 件の不備 | medical_device_regulatory |
| CTL-13485-8.2.3 | ISO-13485 8.2.3 | 現在 L0 · 目標 L3 | record_invalid: 記録の内容が仕様を満たしません — data/medical-device/ledgers/adverse-event-records.yaml: 1 件の不備 | medical_device_regulatory |
| CTL-14001-6.1.2 | ISO-14001 6.1.2 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-14001/environmental-aspects.csv: 1 件の不備 | esg_sustainability |
| CTL-14001-6.1.3 | ISO-14001 6.1.3 | 現在 L0 · 目標 L2 | — | esg_sustainability |
| CTL-14001-8.2 | ISO-14001 8.2 | 現在 L0 · 目標 L2 | — | esg_sustainability |
| CTL-14001-9.1.2 | ISO-14001 9.1.2 | 現在 L0 · 目標 L3 | — | compliance |
| CTL-20000-8.3.3 | ISO-20000 8.3.3 | 現在 L0 · 目標 L2 | — | devops |
| CTL-20000-8.6.1 | ISO-20000 8.6.1 | 現在 L0 · 目標 L2 | — | devops |
| CTL-20000-8.5.1 | ISO-20000 8.5.1 | 現在 L0 · 目標 L2 | — | devops |
| CTL-20000-8.2.6 | ISO-20000 8.2.6 | 現在 L0 · 目標 L2 | — | devops |
| CTL-20000-8.7.1 | ISO-20000 8.7.1 | 現在 L0 · 目標 L2 | — | devops |
| CTL-21401-hygiene | ISO-21401 8.1 | 現在 L0 · 目標 L3 | — | operations |
| CTL-21401-env-aspects | ISO-21401 6.1 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/environmental-aspects.csv: 1 件の不備 | esg_sustainability |
| CTL-21401-env-resources | ISO-21401 9.1 | 現在 L0 · 目標 L3 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/kpi-log.csv: 1 件の不備 | esg_sustainability |
| CTL-21401-env-waste | ISO-21401 8.1 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/kpi-log.csv: 1 件の不備 | esg_sustainability |
| CTL-21401-env-purchasing | ISO-21401 8.1 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/sustainable-purchasing.md: 1 件の不備 | procurement |
| CTL-21401-soc-community | ISO-21401 4.2 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/stakeholder-register.csv: 1 件の不備 | pr_communications |
| CTL-21401-soc-heritage | ISO-21401 8.1 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/socio-cultural-plan.md: 1 件の不備 | esg_sustainability |
| CTL-21401-soc-protection | ISO-21401 8.1 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/guest-protection-policy.md: 1 件の不備 | compliance |
| CTL-21401-soc-accessibility | ISO-21401 8.1 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/accessibility-statement.md: 1 件の不備 | operations |
| CTL-21401-eco-local | ISO-21401 8.1 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/local-economy-log.csv: 1 件の不備 | procurement |
| CTL-21401-guest-safety | ISO-21401 8.1 | 現在 L0 · 目標 L3 | — | operations |
| CTL-21401-guest-communication | ISO-21401 7.4 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/guest-communication.md: 1 件の不備 | pr_communications |
| CTL-21401-worker-welfare | ISO-21401 7.1 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-21401/worker-welfare.md: 1 件の不備 | human_resources |
| CTL-22301-8.2.2 | ISO-22301 8.2.2 | 現在 L0 · 目標 L2 | — | operations |
| CTL-22301-8.4 | ISO-22301 8.4 | 現在 L0 · 目標 L2 | — | operations |
| CTL-22301-8.4.2 | ISO-22301 8.4.2 | 現在 L0 · 目標 L2 | — | operations |
| CTL-22301-8.5 | ISO-22301 8.5 | 現在 L0 · 目標 L3 | — | operations |
| CTL-27001-A.5.10 | ISO-27001 A.5.10 | 現在 L0 · 目標 L2 | — | security |
| CTL-CORE-privacy | ISO-27001 A.5.34 | 現在 L0 · 目標 L2 | — | privacy_officer |
| CTL-37000-P-01 | ISO-37000 purpose | 現在 L0 · 目標 L2 | — | executive_steward |
| CTL-37000-P-02 | ISO-37000 value_generation | 現在 L0 · 目標 L2 | — | finance |
| CTL-37000-P-03 | ISO-37000 strategy | 現在 L0 · 目標 L2 | — | executive_steward |
| CTL-37000-P-04 | ISO-37000 oversight | 現在 L0 · 目標 L2 | — | corporate_governance |
| CTL-37000-P-05 | ISO-37000 accountability | 現在 L0 · 目標 L2 | — | compliance |
| CTL-37000-P-06 | ISO-37000 stakeholder_engagement | 現在 L0 · 目標 L2 | — | executive_steward |
| CTL-37000-P-07 | ISO-37000 leadership | 現在 L0 · 目標 L2 | — | executive_steward |
| CTL-37000-P-08 | ISO-37000 data_and_decisions | 現在 L0 · 目標 L2 | — | executive_steward |
| CTL-37000-P-09 | ISO-37000 risk_governance | 現在 L0 · 目標 L2 | — | compliance |
| CTL-37000-P-10 | ISO-37000 social_responsibility | 現在 L0 · 目標 L2 | — | compliance |
| CTL-37000-P-11 | ISO-37000 viability_and_performance | 現在 L0 · 目標 L2 | — | finance |
| CTL-37001-4.5 | ISO-37001 4.5 | 現在 L0 · 目標 L2 | — | compliance |
| CTL-37001-8.2 | ISO-37001 8.2 | 現在 L0 · 目標 L2 | — | compliance |
| CTL-37001-8.7 | ISO-37001 8.7 | 現在 L0 · 目標 L2 | — | compliance |
| CTL-37001-8.9 | ISO-37001 8.9 | 現在 L0 · 目標 L3 | — | compliance |
| CTL-37001-8.10 | ISO-37001 8.10 | 現在 L0 · 目標 L3 | — | internal_audit |
| CTL-45001-6.1.2 | ISO-45001 6.1.2 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-45001/hazard-register.csv: 1 件の不備 | general_affairs |
| CTL-45001-5.4 | ISO-45001 5.4 | 現在 L0 · 目標 L2 | — | human_resources |
| CTL-45001-8.1.4 | ISO-45001 8.1.4 | 現在 L0 · 目標 L2 | — | procurement |
| CTL-45001-8.2 | ISO-45001 8.2 | 現在 L0 · 目標 L2 | — | general_affairs |
| CTL-45001-10.2.1 | ISO-45001 10.2 | 現在 L0 · 目標 L3 | — | general_affairs |
| CTL-50001-6.3 | ISO-50001 6.3 | 現在 L0 · 目標 L2 | record_invalid: 記録の内容が仕様を満たしません — docs/compliance/iso/ISO-50001/energy-review.md: 1 件の不備 | esg_sustainability |
| CTL-50001-6.5 | ISO-50001 6.5 | 現在 L0 · 目標 L2 | — | esg_sustainability |
| CTL-50001-6.4 | ISO-50001 6.4 | 現在 L0 · 目標 L2 | — | esg_sustainability |
| CTL-50001-8.2 | ISO-50001 8.2 | 現在 L0 · 目標 L2 | — | esg_sustainability |

## 課題

| CTL | 種別 | 内容 | 併記 |
|-----|------|------|------|
| CTL-CORE-competence | observation | 記録の内容が仕様を満たしません — data/medical-device/ledgers/training-records.yaml: 1 件の不備 | — |
| CTL-CORE-doc-control | observation | 記録の内容が仕様を満たしません — data/medical-device/ledgers/document-control-records.yaml: 1 件の不備 | — |

## 改善提案

- **P1 CTL-21401-guest-safety**（ゲストの安全（消防設備・避難・緊急時対応））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/competence/研修実施記録.md に残す。
- **P1 CTL-21401-hygiene**（衛生・清掃基準と委託先の監督）: 成熟度を目標まで上げ、運用記録を docs/properties/PROP-002-kamezawa/operations/records/ に残す。
- **P1 CTL-21401-soc-protection**（差別的取扱いの禁止と児童・青少年の保護）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/guest-protection-policy.md に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-21401/guest-protection-policy.md
- **P1 CTL-21401-worker-welfare**（従業員の労働安全衛生と就業条件）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/worker-welfare.md に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-21401/worker-welfare.md
- **P2 CTL-21401-env-aspects**（著しい環境側面の特定と目標設定）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/environmental-aspects.csv に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-21401/environmental-aspects.csv
- **P2 CTL-21401-env-resources**（エネルギー・水の使用量の測定と削減）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/kpi-log.csv に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-21401/kpi-log.csv
- **P2 CTL-21401-env-waste**（廃棄物の分別・減量と事業系ごみの適正処理）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/kpi-log.csv に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-21401/kpi-log.csv
- **P2 CTL-21401-soc-community**（地域・近隣ステークホルダーとの関係管理）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/stakeholder-register.csv に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-21401/stakeholder-register.csv
- **P2 CTL-CORE-competence**（力量・認識・教育訓練）: 記録の内容を仕様に合わせる: data/medical-device/ledgers/training-records.yaml · docs/compliance/iso/ISO-21401/competence/ · docs/company/regulations/joho-security-kanri-kisoku.md · docs/company/regulations/hinshitsu-kanri-kisoku.md
- **P2 CTL-CORE-corrective-action**（不適合及び是正処置）: 証拠ファイルを用意する: docs/medical-device/qms/ · docs/compliance/iso/ISO-21401/corrective-actions.csv · docs/compliance/iso/ISO-9001/nonconformance-log.csv あわせて: 記録の内容を仕様に合わせる: docs/medical-device/qms/ · docs/compliance/iso/ISO-21401/corrective-actions.csv · docs/compliance/iso/ISO-9001/nonconformance-log.csv
- **P2 CTL-CORE-doc-control**（文書化された情報の管理）: 記録の内容を仕様に合わせる: docs/company/regulations/bunsho-kanri-kisoku.md · data/medical-device/ledgers/document-control-records.yaml
- **P2 CTL-CORE-operation**（運用の計画及び管理）: 成熟度を目標まで上げ、運用記録を docs/company/regulations/shukuhaku-unyo-kisoku.md に残す。
- **P2 CTL-CORE-risk-approach**（リスク及び機会への取組み）: 証拠ファイルを用意する: docs/medical-device/qms/ · docs/compliance/iso/ISO-21401/risk-opportunities.csv · docs/compliance/iso/ISO-27001/risk-register.csv · docs/compliance/iso/ISO-9001/risk-opportunities.csv あわせて: 記録の内容を仕様に合わせる: docs/medical-device/qms/ · docs/compliance/iso/ISO-21401/risk-opportunities.csv · docs/compliance/iso/ISO-27001/risk-register.csv · docs/compliance/iso/ISO-9001/risk-opportunities.csv
- **P3 CTL-13485-4.2.2**（品質マニュアル）: 成熟度を目標まで上げ、運用記録を docs/medical-device/qms/ に残す。
- **P3 CTL-13485-7.3**（設計・開発）: 成熟度を目標まで上げ、運用記録を docs/medical-device/qms/ に残す。
- **P3 CTL-13485-7.4**（購買）: 成熟度を目標まで上げ、運用記録を docs/medical-device/qms/ に残す。
- **P3 CTL-13485-7.5**（製造及びサービス提供）: 成熟度を目標まで上げ、運用記録を data/medical-device/ledgers/manufacturing-batch-records.yaml に残す。
- **P3 CTL-13485-7.5.9**（トレーサビリティ）: 成熟度を目標まで上げ、運用記録を data/medical-device/ledgers/distribution-records.yaml に残す。
- **P3 CTL-13485-8.2.2**（苦情処理）: 成熟度を目標まで上げ、運用記録を data/medical-device/ledgers/complaint-records.yaml に残す。 あわせて: 記録の内容を仕様に合わせる: data/medical-device/ledgers/complaint-records.yaml
- **P3 CTL-13485-8.2.3**（規制当局への報告）: 成熟度を目標まで上げ、運用記録を data/medical-device/ledgers/adverse-event-records.yaml に残す。 あわせて: 記録の内容を仕様に合わせる: data/medical-device/ledgers/adverse-event-records.yaml
- **P3 CTL-14001-6.1.2**（環境側面及び著しい側面の決定）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-14001/environmental-aspects.csv に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-14001/environmental-aspects.csv
- **P3 CTL-14001-6.1.3**（順守義務（法令・その他要求事項））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-14001/compliance-obligations.csv に残す。
- **P3 CTL-14001-8.2**（緊急事態への準備及び対応）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-14001/emergency-preparedness.md に残す。
- **P3 CTL-14001-9.1.2**（順守評価）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-14001/compliance-evaluation.md に残す。
- **P3 CTL-20000-8.2.6**（構成管理（CMDB））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-20000/configuration-items.csv に残す。
- **P3 CTL-20000-8.3.3**（サービスレベル管理（SLA））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-20000/service-level-agreements.md に残す。
- **P3 CTL-20000-8.5.1**（変更管理）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-20000/change-records/ に残す。
- **P3 CTL-20000-8.6.1**（インシデント管理）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-20000/incident-records/ に残す。
- **P3 CTL-20000-8.7.1**（サービス可用性・継続性）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-20000/availability-plan.md に残す。
- **P3 CTL-21401-eco-local**（地域経済への貢献（地域調達・地域雇用））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/local-economy-log.csv に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-21401/local-economy-log.csv
- **P3 CTL-21401-env-purchasing**（環境配慮型の調達（洗剤・アメニティ・消耗品））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/sustainable-purchasing.md に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-21401/sustainable-purchasing.md
- **P3 CTL-21401-guest-communication**（サステナビリティ情報の提供と表示の実態一致）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/guest-communication.md に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-21401/guest-communication.md
- **P3 CTL-21401-soc-accessibility**（アクセシビリティ対応と正確な情報提供）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/accessibility-statement.md に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-21401/accessibility-statement.md
- **P3 CTL-21401-soc-heritage**（地域文化・景観への配慮と地域資源の活用）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-21401/socio-cultural-plan.md に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-21401/socio-cultural-plan.md
- **P3 CTL-22301-8.2.2**（事業影響度分析（RTO/RPO））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-22301/business-impact-analysis.csv に残す。
- **P3 CTL-22301-8.4**（事業継続計画及び手順）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-22301/business-continuity-plan.md に残す。
- **P3 CTL-22301-8.4.2**（警報・伝達手順）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-22301/communication-procedure.md に残す。
- **P3 CTL-22301-8.5**（演習及び試験）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-22301/exercise-records/ に残す。
- **P3 CTL-27001-A.5.10**（情報の分類）: 成熟度を目標まで上げ、運用記録を data/classification-registry.yaml に残す。
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
- **P3 CTL-37001-4.5**（贈収賄リスク評価）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-37001/bribery-risk-assessment.csv に残す。
- **P3 CTL-37001-8.10**（疑義の調査及び対応）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-37001/investigation-records/ に残す。
- **P3 CTL-37001-8.2**（取引先デューデリジェンス）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-37001/due-diligence-records/ に残す。
- **P3 CTL-37001-8.7**（贈答・接待・寄附の管理）: 成熟度を目標まで上げ、運用記録を docs/company/regulations/riekisohan-torihiki-kisoku.md に残す。
- **P3 CTL-37001-8.9**（通報窓口（内部通報））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-37001/whistleblowing-procedure.md に残す。
- **P3 CTL-45001-10.2.1**（インシデント・労働災害の調査）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-45001/incident-log.csv に残す。
- **P3 CTL-45001-5.4**（働く人の協議及び参加）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-45001/consultation-records.md に残す。
- **P3 CTL-45001-6.1.2**（危険源の特定及びリスク評価）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-45001/hazard-register.csv に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-45001/hazard-register.csv
- **P3 CTL-45001-8.1.4**（請負者・調達先の安全管理）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-45001/contractor-safety.md に残す。
- **P3 CTL-45001-8.2**（緊急事態への準備及び対応）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-45001/emergency-plan.md に残す。
- **P3 CTL-50001-6.3**（エネルギーレビュー）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-50001/energy-review.md に残す。 あわせて: 記録の内容を仕様に合わせる: docs/compliance/iso/ISO-50001/energy-review.md
- **P3 CTL-50001-6.4**（エネルギーパフォーマンス指標（EnPI））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-50001/enpi.csv に残す。
- **P3 CTL-50001-6.5**（エネルギーベースライン（EnB））: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-50001/energy-baseline.csv に残す。
- **P3 CTL-50001-8.2**（設計におけるエネルギー考慮）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/ISO-50001/design-energy-review.md に残す。
- **P3 CTL-CORE-management-review**（マネジメントレビュー）: 成熟度を目標まで上げ、運用記録を docs/compliance/iso/management-review-fy2026-template.md · docs/medical-device/qms/ に残す。
- **P3 CTL-CORE-privacy**（個人情報保護統制）: 成熟度を目標まで上げ、運用記録を docs/company/regulations/kojin-joho-hogo-kisoku.md · docs/compliance/privacy/ に残す。

P1 は人の安全・法令上の要求で待てないもの、P2 は他が依存する土台、P3 は改善・報告。

## 注記

- 本レポートは control-map と証拠パスの決定論検査である。ISO 公式本文の都度解釈ではない。
- 条項番号はパックが持つ対応表であり、既定では未検証。状態は `orgos iso clauses` で確認する。
- 認定機関の証明書は出さない。署名は人間が行う。
- 監査ログ: `data/compliance/iso-internal-audit.jsonl`
