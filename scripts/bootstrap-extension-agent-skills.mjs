#!/usr/bin/env node
/**
 * Extension Agent skills (2 per agent) + manifest sync for 90%+ readiness.
 * Run: node scripts/bootstrap-extension-agent-skills.mjs
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const ROOT = join(import.meta.dirname, "..");
const SKILLS_DIR = join(ROOT, "steward/core/skills/extension");
const REGISTRY_PATH = join(ROOT, "steward/core/skills/registry.yaml");
const MANIFEST_PATH = join(ROOT, "steward/core/agents/agent-capability-manifest.yaml");

/** [agent_id, skill_id, skill_id, agent_label, description1, description2, cli1?, cli2?] */
const EXTENSION_SKILL_MAP = [
  ["coo", "coo_work_order_triage", "coo_routing_review", "COO", "Work Order 優先度付け", "routing-queue レビュー", "escalate", "routing-queue"],
  ["cto", "cto_architecture_review", "cto_tech_radar", "CTO", "アーキテクチャレビュー", "技術選定 · 負債スキャン"],
  ["engineering", "engineering_code_review", "engineering_standards_check", "Engineering", "コードレビュー準備", "コーディング規約整合"],
  ["design_lead", "design_lead_review", "design_system_audit", "Design Lead", "デザインレビュー", "デザインシステム監査"],
  ["design", "design_asset_inventory", "design_ui_spec_draft", "Design", "素材 · 資産棚卸", "UI 仕様下書き"],
  ["sales_lead", "sales_pipeline_review", "sales_forecast_prep", "Sales Lead", "パイプライン分析", "受注予測"],
  ["sales_outbound", "sales_outbound_list_review", "sales_outreach_draft", "Sales Outbound", "リスト精査", "アウトバウンド文案"],
  ["sales_inbound", "sales_inbound_triage", "sales_inquiry_response", "Sales Inbound", "問合せトリアージ", "初回回答下書き"],
  ["customer_success", "cs_health_check", "cs_renewal_risk", "Customer Success", "顧客ヘルスチェック", "更新リスク"],
  ["marketing_lead", "marketing_content_calendar", "marketing_campaign_brief", "Marketing Lead", "コンテンツカレンダー", "キャンペーン企画書"],
  ["social_media", "social_calendar", "social_post_draft", "Social Media", "投稿カレンダー", "投稿文案"],
  ["personal_finance", "personal_budget_review", "personal_expense_categorize", "Personal Finance", "個人予算レビュー", "支出分類"],
  ["legal", "legal_register_review", "legal_clause_check", "Legal", "法務登記 · 規程整合", "契約条項チェック"],
  ["security", "security_control_review", "security_classification_audit", "Security", "統制レビュー", "分類監査"],
  ["human_resources", "hr_policy_review", "hr_labor_compliance", "Human Resources", "就業規則 · HR ポリシー", "労務コンプライアンス"],
  ["corporate_governance", "governance_meeting_prep", "governance_register_review", "Corporate Governance", "株主総会 · 取締役会準備", "ガバナンス台帳"],
  ["procurement", "procurement_order_review", "procurement_vendor_eval", "Procurement", "発注レビュー", "供給者評価"],
  ["government_affairs", "gov_subsidy_eligibility", "gov_regulatory_watch", "Government Affairs", "補助金適格性", "規制動向ウォッチ", "operations subsidy"],
  ["intellectual_property", "ip_portfolio_review", "ip_trademark_status", "Intellectual Property", "IP ポートフォリオ", "商標ステータス", "operations trademark"],
  ["general_affairs", "ga_office_ops_check", "ga_vendor_contract_review", "General Affairs", "総務オペ確認", "業者契約レビュー"],
  ["project_management", "pm_status_review", "pm_milestone_tracking", "Project Management", "プロジェクト状況", "マイルストーン追跡"],
  ["product_management", "pm_roadmap_review", "pm_feature_prioritization", "Product Management", "ロードマップ", "機能優先度"],
  ["recruiting", "recruiting_pipeline_review", "recruiting_interview_prep", "Recruiting", "採用パイプライン", "面接準備"],
  ["risk_insurance", "risk_register_review", "risk_insurance_renewal", "Risk & Insurance", "リスク台帳", "保険更新"],
  ["data_analytics", "analytics_metrics_review", "analytics_data_quality", "Data Analytics", "KPI · メトリクス", "データ品質"],
  ["devops", "devops_infra_health", "devops_deploy_checklist", "DevOps", "インフラヘルス", "デプロイチェックリスト"],
  ["investor_relations", "ir_materials_prep", "ir_shareholder_comm", "Investor Relations", "IR 資料準備", "株主コミュニケーション"],
  ["esg_sustainability", "esg_metrics_review", "esg_report_prep", "ESG", "ESG 指標", "サステナビリティ報告"],
  ["privacy_officer", "privacy_impact_review", "privacy_data_inventory", "Privacy Officer", "PIMS · DPIA", "データ棚卸"],
  ["treasury", "treasury_cash_position", "treasury_liquidity_forecast", "Treasury", "キャッシュポジション", "流動性予測"],
  ["customer_support", "support_ticket_triage", "support_sla_check", "Customer Support", "チケットトリアージ", "SLA 確認"],
  ["pr_communications", "pr_press_release_draft", "pr_media_monitoring", "PR", "プレスリリース", "メディアモニタリング"],
  ["learning_development", "ld_training_plan", "ld_competency_gap", "L&D", "研修計画", "コンピテンシーギャップ"],
  ["corporate_development", "corpdev_ma_screen", "corpdev_partnership_brief", "Corp Dev", "M&A スクリーニング", "提携ブリーフ"],
  ["quality_assurance", "qa_nonconformance_triage", "qa_iso9001_controls", "Quality Assurance", "不適合初動", "ISO 9001 統制", "controls gap"],
  ["operations", "operations_records_review", "operations_travel_booking", "Operations", "入出力記録レビュー", "旅費 · 旅行手配", "document-io", "operations travel"],
];

function skillMd(id, title, purpose, agent, cli) {
  const cliBlock = cli
    ? `\n## CLI\n\n\`\`\`bash\nnpm run orgos -- ${cli}\n\`\`\`\n`
    : "";
  return `# Skill: ${id}

## 目的

${purpose}

## 使用 Agent

${agent} Agent
${cliBlock}
## 出力

\`docs/reports/agent-summaries/{slug}/{YYYY-MM-DD}-{topic}.md\`
`;
}

mkdirSync(SKILLS_DIR, { recursive: true });

const newRegistryEntries = [];
const manifestUpdates = {};

for (const row of EXTENSION_SKILL_MAP) {
  const [agentId, id1, id2, label, d1, d2, cli1, cli2] = row;
  const skills = [id1, id2];
  manifestUpdates[agentId] = skills;

  for (const [id, desc, cli] of [
    [id1, d1, cli1],
    [id2, d2, cli2],
  ]) {
    const file = `extension/${id}.md`;
    const full = join(SKILLS_DIR, `${id}.md`);
    if (!existsSync(full)) {
      writeFileSync(full, skillMd(id, desc, desc, label, cli), "utf-8");
    }
    newRegistryEntries.push({
      id,
      file,
      runtime: cli ? "cli" : "cursor-only",
      ...(cli ? { cli_command: cli } : {}),
      agent: label,
      description: desc,
    });
  }
}

// Append to registry (skip duplicates)
const regText = readFileSync(REGISTRY_PATH, "utf-8");
const reg = YAML.parse(regText);
const existingIds = new Set(reg.skills.map((s) => s.id));
for (const entry of newRegistryEntries) {
  if (!existingIds.has(entry.id)) {
    reg.skills.push(entry);
    existingIds.add(entry.id);
  }
}
writeFileSync(REGISTRY_PATH, YAML.stringify(reg), "utf-8");
console.log(`✓ registry.yaml (+${newRegistryEntries.filter((e) => !regText.includes(`id: ${e.id}`)).length} skills)`);

const manifest = YAML.parse(readFileSync(MANIFEST_PATH, "utf-8"));
for (const agent of manifest.agents) {
  if (manifestUpdates[agent.id]) {
    agent.skills = manifestUpdates[agent.id];
  }
}
writeFileSync(MANIFEST_PATH, YAML.stringify(manifest), "utf-8");
console.log(`✓ agent-capability-manifest.yaml (${Object.keys(manifestUpdates).length} agents updated)`);
