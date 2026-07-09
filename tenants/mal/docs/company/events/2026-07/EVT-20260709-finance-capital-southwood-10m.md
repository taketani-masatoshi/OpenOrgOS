---
event_id: EVT-20260709-finance-capital-southwood-10m
occurred_at: 2026-07-09
kind: finance
status: open
artifact_dir: docs/company/artifacts/2026-07/EVT-20260709-finance-capital-southwood-10m/
---

# Southwoodへ資本出資1000万円

## 概要

グループ会社 **株式会社サウスウッド**（テナント `southwood`）へ、当方（株式会社 MAL）の銀行口座から **1,000 万円** の資本出資を実行した。

- 出資額: 10,000,000 円
- 出金口座: `bank_account_id: BANK-001`（三井住友銀行 · 運転資金）
- 相手先イベント: `southwood` · `EVT-20260709-finance-capital-mal-10m`

## 経緯

- 2026-07-09: グループ CEO 指示に基づき、当方銀行口座から Southwood へ 1,000 万円の出資を実行
- 2026-07-09: 本イベント記録を作成（振込証憑は artifacts `records/` へ · L2）

## 関連 ID

- investee_tenant: southwood
- counterparty_event_id: EVT-20260709-finance-capital-mal-10m
- amount_yen: 10000000
- bank_account_id: BANK-001
- investor: 株式会社MAL

## 出力書類

書類はイベント記録と分離して保管します。

- 索引: `docs/company/artifacts/2026-07/EVT-20260709-finance-capital-southwood-10m/00-artifact-index.md`
- フォルダ: `docs/company/artifacts/2026-07/EVT-20260709-finance-capital-southwood-10m/`
- PDF/scan: `docs/company/artifacts/2026-07/EVT-20260709-finance-capital-southwood-10m/records/`（L2 · gitignore）
