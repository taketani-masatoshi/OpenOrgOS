---
event_id: EVT-20260702-governance-miyagi-director-resignation
occurred_at: 2026-07-02
kind: governance
status: open
artifact_dir: docs/company/artifacts/2026-07/EVT-20260702-governance-miyagi-director-resignation/
---

# 宮城万貴子 取締役退任

## 概要

取締役兼代表取締役 **宮城万貴子** の退任意向に基づき、辞任届送付・社内決議・登記手続を進める。

- 書類パッケージ: [`docs/company/governance/miyagi-resignation-2026-07/`](../../governance/miyagi-resignation-2026-07/README.md)
- CEO 段取り: [`00-runbook-ceo.md`](../../governance/miyagi-resignation-2026-07/00-runbook-ceo.md)
- 社長タスク: TASK-012

## 経緯

- 2026-07-02: 宮城万貴子より取締役退任の意向を確認
- 2026-07-02: 辞任届・送付案内・社内議事録ドラフトを作成（送付準備完了）
- （予定）辞任届 PDF 返送受領 → 臨時取締役会・臨時株主総会 → 登記申請

## 関連 ID

- personnel: EMP-002（宮城万貴子）
- task: TASK-012

## 出力書類

書類はイベント記録と分離して保管します。

- 索引: `docs/company/artifacts/2026-07/EVT-20260702-governance-miyagi-director-resignation/00-artifact-index.md`
- 正本（Markdown）: `docs/company/governance/miyagi-resignation-2026-07/`
- 送付 outbox: OUT-003（`document-io.yaml`）
- 返送 inbox: `docs/io/inbox/corporate/governance/`
- PDF/scan: `docs/company/artifacts/2026-07/EVT-20260702-governance-miyagi-director-resignation/records/`（L2 · gitignore）
