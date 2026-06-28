# アクティブコンテキスト — テナント `sg-demo`

**正本:** `modules.yaml` · `standards.yaml` · `regulations.yaml` · **生成:** `npm run orgos -- modules sync-context`

**法域（legal）:** `SG` · Singapore law
**表示言語（display）:** `en` · BCP 47 `en-SG` · English
**entity:** `pte_ltd` — Private Company Limited by Shares · **currency:** `SGD` · **pack tier:** `full`

> **トークン節約:** 本ファイルに列挙されたパスのみ Agent が読む。無効モジュール · 無効 ISO · 無効規程 · カタログ seed/テンプレは **@file 明示時以外読まない。**

---

## 有効業務モジュール

（なし）
## 無効業務モジュール（読取禁止）

- `rental` / `rental` — `steward/modules/rental/` **読まない**
- `travel_booking` / `travel_booking` — `steward/modules/travel_booking/` **読まない**

## 有効 ISO 標準

（なし — `standards.yaml` で有効化）

## 無効 ISO 標準（読取禁止）

- `ISO-13485` — `steward/standards/iso/ISO-13485/` **読まない**
- `ISO-14001` — `steward/standards/iso/ISO-14001/` **読まない**
- `ISO-20000` — `steward/standards/iso/ISO-20000/` **読まない**
- `ISO-21401` — `steward/standards/iso/ISO-21401/` **読まない**
- `ISO-22000` — `steward/standards/iso/ISO-22000/` **読まない**
- `ISO-22301` — `steward/standards/iso/ISO-22301/` **読まない**
- `ISO-27001` — `steward/standards/iso/ISO-27001/` **読まない**
- `ISO-37001` — `steward/standards/iso/ISO-37001/` **読まない**
- `ISO-45001` — `steward/standards/iso/ISO-45001/` **読まない**
- `ISO-50001` — `steward/standards/iso/ISO-50001/` **読まない**
- `ISO-9001` — `steward/standards/iso/ISO-9001/` **読まない**

## 有効社内規程

- **REG-SG-001** Officer Compensation Policy — 施行: `docs/company/regulations/officer-compensation-policy.md` · テンプレ: `steward/jurisdiction-packs/SG/regulations/templates/core/REG-SG-001-officer-comp/template.md`
- **REG-SG-002** Board Meeting Procedures — 施行: `docs/company/regulations/board-meeting-procedures.md` · テンプレ: `steward/jurisdiction-packs/SG/regulations/templates/core/REG-SG-002-board-meetings/template.md`
- **REG-SG-003** Shareholder Meeting Procedures — 施行: `docs/company/regulations/shareholder-meeting-procedures.md` · テンプレ: `steward/jurisdiction-packs/SG/regulations/templates/core/REG-SG-003-shareholder-meetings/template.md`
- **REG-SG-004** Approval Authority Policy — 施行: `docs/company/regulations/approval-authority-policy.md` · テンプレ: `steward/jurisdiction-packs/SG/regulations/templates/core/REG-SG-004-approval-authority/template.md`
- **REG-SG-005** Expense Reimbursement Policy — 施行: `docs/company/regulations/expense-reimbursement-policy.md` · テンプレ: `steward/jurisdiction-packs/SG/regulations/templates/core/REG-SG-005-expense-reimbursement/template.md`
- **REG-SG-006** Conflict of Interest Policy — 施行: `docs/company/regulations/conflict-of-interest-policy.md` · テンプレ: `steward/jurisdiction-packs/SG/regulations/templates/core/REG-SG-006-conflict-of-interest/template.md`
- **REG-SG-007** Document Retention Policy — 施行: `docs/company/regulations/document-retention-policy.md` · テンプレ: `steward/jurisdiction-packs/SG/regulations/templates/core/REG-SG-007-document-retention/template.md`
- **REG-SG-008** Travel and Business Expense Policy — 施行: `docs/company/regulations/travel-policy.md` · テンプレ: `steward/jurisdiction-packs/SG/regulations/templates/core/REG-SG-008-travel/template.md`

## 無効社内規程（読取禁止）

（なし）

## 未バインドカタログ（読取禁止）

- `clinic` — `modules.yaml` 未登録 · **読まない**
- `construction` — `modules.yaml` 未登録 · **読まない**
- `ecommerce` — `modules.yaml` 未登録 · **読まない**
- `education` — `modules.yaml` 未登録 · **読まない**
- `event_operations` — `modules.yaml` 未登録 · **読まない**
- `event_space` — `modules.yaml` 未登録 · **読まない**
- `hospitality` — `modules.yaml` 未登録 · **読まない**
- `language_bridge` — `modules.yaml` 未登録 · **読まない**
- `logistics` — `modules.yaml` 未登録 · **読まない**
- `membership` — `modules.yaml` 未登録 · **読まない**
- `professional_services` — `modules.yaml` 未登録 · **読まない**
- `property_management` — `modules.yaml` 未登録 · **読まない**
- `real_estate_brokerage` — `modules.yaml` 未登録 · **読まない**
- `restaurant` — `modules.yaml` 未登録 · **読まない**
- `retail_store` — `modules.yaml` 未登録 · **読まない**
- `saas_subscription` — `modules.yaml` 未登録 · **読まない**
- `software_outsourcing` — `modules.yaml` 未登録 · **読まない**
- `staffing` — `modules.yaml` 未登録 · **読まない**
- `venture_capital` — `modules.yaml` 未登録 · **読まない**

## Secretary 読取面（on_demand · @file 明示）

Secretary Agent が管轄する executive SoT。Git 追跡は `*.example.*` のみ · 実データは gitignore。

| 論理パス | 用途 | ai_context |
|---------|------|------------|
| `data/executive/calendar.yaml` | 予定 SoT | on_demand |
| `data/executive/tasks.yaml` | 社長タスク | on_demand |
| `data/executive/one-on-ones.yaml` | 1-on-1 レジストリ | on_demand |
| `data/executive/external-contacts.yaml` | 社外連絡先 | on_demand |
| `data/executive/stakeholders.yaml` | 利害関係者（Executive Steward は **読まない**） | on_demand |
| `docs/executive/correspondence-drafts/` | 承認待ち下書き MD | on_demand |
| `docs/executive/one-on-one-prep-*.md` | MTG 準備 MD | on_demand |
| `docs/executive/stakeholders/*.md` | プロフィール MD（`*.example.md` のみ Git） | on_demand |

初回セットアップ: [data/executive/00-README.md](data/executive/00-README.md) · バックアップ: [docs/executive/backup-procedure.md](docs/executive/backup-procedure.md)

## Steward / Executive

- コア Agent のみ常時: `steward/core/agents/`
- Executive Steward は **dashboard / agent-summaries / executive-notes** 経由（`data/executive/` 直読禁止）
- 規程索引のみ: `docs/company/regulations/00-このフォルダについて.md`（本文は有効 REG のみ）
- 要約: 有効モジュールの `summary_dir` のみ
- カタログ: `steward/modules/00-このフォルダについて.md` · `steward/jurisdiction-packs/SG/regulations/catalog.yaml`
