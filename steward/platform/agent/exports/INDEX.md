# OrgOS Agent Export Index

Generated: 2026-08-29 · Tenant: mal

Regenerate all packs:

```bash
orgos operator export --all
orgos operator sync-policy --emit all
```

## コア Agent

| id | 名称 | 定義 Path | Export pack |
|----|------|-----------|-------------|
| executive_steward | ステュワード（経営統括） | `steward/core/agents/executive_steward_agent.md` | `exports/agents/executive_steward.pack.md` |
| secretary | 秘書 | `steward/core/agents/secretary_agent.md` | `exports/agents/secretary.pack.md` |
| setup | 初期設定 | `steward/core/agents/setup_agent.md` | `exports/agents/setup.pack.md` |
| finance | 財務・計画 | `steward/core/agents/finance_agent.md` | `exports/agents/finance.pack.md` |
| contract | 契約管理 | `steward/core/agents/contract_agent.md` | `exports/agents/contract.pack.md` |
| compliance | コンプライアンス | `steward/core/agents/compliance_agent.md` | `exports/agents/compliance.pack.md` |
| operations | 業務運用 | `steward/core/agents/operations_agent.md` | `exports/agents/operations.pack.md` |

## 拡張 Agent

| id | 名称 | 定義 Path | Export pack |
|----|------|-----------|-------------|
| integration | 統合 | `steward/core/agents/integration_agent.md` | `exports/agents/integration.pack.md` |
| mail_intake | メール取込 | `steward/core/agents/mail_intake_agent.md` | `exports/agents/mail_intake.pack.md` |
| mail_outbound | メール送信 | `steward/core/agents/mail_outbound_agent.md` | `exports/agents/mail_outbound.pack.md` |
| coo | 統括執行 | `steward/core/agents/coo_agent.md` | `exports/agents/coo.pack.md` |
| cto | 技術統括 | `steward/core/agents/cto_agent.md` | `exports/agents/cto.pack.md` |
| engineering | エンジニア | `steward/core/agents/engineering_agent.md` | `exports/agents/engineering.pack.md` |
| design_lead | デザイン統括 | `steward/core/agents/design_lead_agent.md` | `exports/agents/design_lead.pack.md` |
| design | デザイナー | `steward/core/agents/design_agent.md` | `exports/agents/design.pack.md` |
| sales_lead | 営業統括 | `steward/core/agents/sales_lead_agent.md` | `exports/agents/sales_lead.pack.md` |
| sales_outbound | 新規開拓（アウトバウンド） | `steward/core/agents/sales_outbound_agent.md` | `exports/agents/sales_outbound.pack.md` |
| sales_inbound | 新規開拓（インバウンド） | `steward/core/agents/sales_inbound_agent.md` | `exports/agents/sales_inbound.pack.md` |
| customer_success | カスタマーサクセス | `steward/core/agents/customer_success_agent.md` | `exports/agents/customer_success.pack.md` |
| marketing_lead | マーケティング統括 | `steward/core/agents/marketing_lead_agent.md` | `exports/agents/marketing_lead.pack.md` |
| social_media | SNS 担当 | `steward/core/agents/social_media_agent.md` | `exports/agents/social_media.pack.md` |
| personal_finance | 個人財務 | `steward/core/agents/personal_finance_agent.md` | `exports/agents/personal_finance.pack.md` |
| legal | 法務 | `steward/core/agents/legal_agent.md` | `exports/agents/legal.pack.md` |
| security | セキュリティ統括 | `steward/core/agents/security_agent.md` | `exports/agents/security.pack.md` |
| human_resources | 人事・労務 | `steward/core/agents/human_resources_agent.md` | `exports/agents/human_resources.pack.md` |
| corporate_governance | コーポレートガバナンス | `steward/core/agents/corporate_governance_agent.md` | `exports/agents/corporate_governance.pack.md` |
| accounting | 経理実務 | `steward/core/agents/accounting_agent.md` | `exports/agents/accounting.pack.md` |
| tax | 税務 | `steward/core/agents/tax_agent.md` | `exports/agents/tax.pack.md` |
| procurement | 購買・調達 | `steward/core/agents/procurement_agent.md` | `exports/agents/procurement.pack.md` |
| government_affairs | 行政・公的制度 | `steward/core/agents/government_affairs_agent.md` | `exports/agents/government_affairs.pack.md` |
| intellectual_property | 知財 | `steward/core/agents/intellectual_property_agent.md` | `exports/agents/intellectual_property.pack.md` |
| general_affairs | 総務 | `steward/core/agents/general_affairs_agent.md` | `exports/agents/general_affairs.pack.md` |
| project_management | PMO | `steward/core/agents/project_management_agent.md` | `exports/agents/project_management.pack.md` |
| product_management | プロダクト | `steward/core/agents/product_management_agent.md` | `exports/agents/product_management.pack.md` |
| recruiting | 採用 | `steward/core/agents/recruiting_agent.md` | `exports/agents/recruiting.pack.md` |
| risk_insurance | リスク・保険 | `steward/core/agents/risk_insurance_agent.md` | `exports/agents/risk_insurance.pack.md` |
| data_analytics | データ分析 | `steward/core/agents/data_analytics_agent.md` | `exports/agents/data_analytics.pack.md` |
| devops | DevOps | `steward/core/agents/devops_agent.md` | `exports/agents/devops.pack.md` |
| investor_relations | IR | `steward/core/agents/investor_relations_agent.md` | `exports/agents/investor_relations.pack.md` |
| esg_sustainability | ESG | `steward/core/agents/esg_sustainability_agent.md` | `exports/agents/esg_sustainability.pack.md` |
| internal_audit | 内部監査 | `steward/core/agents/internal_audit_agent.md` | `exports/agents/internal_audit.pack.md` |
| records_audit | 記録監査 | `steward/core/agents/records_audit_agent.md` | `exports/agents/records_audit.pack.md` |
| privacy_officer | 個情管理責任者 | `steward/core/agents/privacy_officer_agent.md` | `exports/agents/privacy_officer.pack.md` |
| treasury | 資金・FX | `steward/core/agents/treasury_agent.md` | `exports/agents/treasury.pack.md` |
| customer_support | サポート | `steward/core/agents/customer_support_agent.md` | `exports/agents/customer_support.pack.md` |
| pr_communications | 広報 | `steward/core/agents/pr_communications_agent.md` | `exports/agents/pr_communications.pack.md` |
| learning_development | 研修 | `steward/core/agents/learning_development_agent.md` | `exports/agents/learning_development.pack.md` |
| corporate_development | 経企 | `steward/core/agents/corporate_development_agent.md` | `exports/agents/corporate_development.pack.md` |
| quality_assurance | 品質保証 | `steward/core/agents/quality_assurance_agent.md` | `exports/agents/quality_assurance.pack.md` |
| medical_device_regulatory | 医療機器薬事 | `steward/core/agents/medical_device_regulatory_agent.md` | `exports/agents/medical_device_regulatory.pack.md` |

## 外部 LLM クイックスタート

1. `exports/agents/<id>.pack.md` を system / project instructions に貼る
2. または workspace 内 `steward/core/agents/*_agent.md` をファイル添付
3. MCP: `exports/mcp/` の snippet を IDE に設定 · `orgos mcp start`
4. Shell: `ORGOS_SHELL_PROFILE=aider` + `orgos agent dispatch run --runtime shell`
