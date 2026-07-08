# Skill: internal_audit_scope（内部監査スコープ）

## 目的

統制レジストリ（CTL）から internal_audit 担当統制を抽出し、監査計画スコープのたたき台を生成する。

## 入力

- `data/compliance/controls.yaml`
- `docs/compliance/iso/internal-audit-plan-fy2026.md`（または当年度計画）
- `orgos controls for-agent internal_audit` 出力

## 出力

- 監査対象 CTL 一覧 MD
- `docs/reports/agent-summaries/internal-audit/controls-{YYYY-MM-DD}.md`

## 使用 Agent

Internal Audit Agent

## CLI

```bash
npm run orgos -- controls for-agent internal_audit
npm run orgos -- skills run internal-audit-scope
```

## 禁止

- 監査対象の自己承認
- Compliance 規程本文の改定
