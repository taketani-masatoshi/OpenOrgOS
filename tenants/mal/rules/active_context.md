# アクティブコンテキスト — テナント `mal`

**正本:** `modules.yaml` · `standards.yaml` · `regulations.yaml` · **生成:** `npm run steward -- modules sync-context`

**法域（legal）:** `JP` · 日本法
**表示言語（display）:** `ja` · BCP 47 `ja-JP` · 日本語
**entity:** `kk` — 株式会社 · **currency:** `JPY` · **pack tier:** `full`

> **トークン節約:** 本ファイルに列挙されたパスのみ Agent が読む。無効モジュール · 無効 ISO · 無効規程 · カタログ seed/テンプレは **@file 明示時以外読まない。**

---

## 有効業務モジュール

### `rental` (`rental`)

- Agent: `steward/modules/rental/agent.md`
- 物件: `PROP-001`
- docs: `docs/properties/PROP-001-bancho/operations/`
- 要約: `docs/reports/agent-summaries/prop-001/`

### `hospitality` (`hospitality`)

- Agent: `steward/modules/hospitality/agent.md`
- 物件: `PROP-002`
- docs: `docs/properties/PROP-002-kamezawa/operations/`
- 要約: `docs/reports/agent-summaries/prop-002/`

### `travel_booking` (`travel_booking`)

- Agent: `steward/modules/travel_booking/agent.md`
- data: `data/operations/`
- docs: `docs/operations/`
- 要約: `docs/reports/agent-summaries/operations/`

## 無効業務モジュール（読取禁止）

- `professional_services` / `professional_services` — `steward/modules/professional_services/` **読まない**
- `venture_capital` / `venture_capital` — `steward/modules/venture_capital/` **読まない**
- `saas_subscription` / `saas_subscription` — `steward/modules/saas_subscription/` **読まない**
- `event_space` / `event_space` — `steward/modules/event_space/` **読まない**
- `ecommerce` / `ecommerce` — `steward/modules/ecommerce/` **読まない**
- `restaurant` / `restaurant` — `steward/modules/restaurant/` **読まない**
- `retail_store` / `retail_store` — `steward/modules/retail_store/` **読まない**
- `clinic` / `clinic` — `steward/modules/clinic/` **読まない**
- `logistics` / `logistics` — `steward/modules/logistics/` **読まない**
- `staffing` / `staffing` — `steward/modules/staffing/` **読まない**
- `construction` / `construction` — `steward/modules/construction/` **読まない**
- `education` / `education` — `steward/modules/education/` **読まない**
- `property_management` / `property_management` — `steward/modules/property_management/` **読まない**
- `membership` / `membership` — `steward/modules/membership/` **読まない**

## 有効 ISO 標準

- **ISO-21401** — テンプレ: `steward/standards/iso/ISO-21401/` · 記録: `docs/compliance/iso/ISO-21401/`
- **ISO-27001** — テンプレ: `steward/standards/iso/ISO-27001/` · 記録: `docs/compliance/iso/ISO-27001/`
- **ISO-9001** — テンプレ: `steward/standards/iso/ISO-9001/` · 記録: `docs/compliance/iso/ISO-9001/`

## 無効 ISO 標準（読取禁止）

- `ISO-13485` — `steward/standards/iso/ISO-13485/` **読まない**
- `ISO-14001` — `steward/standards/iso/ISO-14001/` **読まない**
- `ISO-20000` — `steward/standards/iso/ISO-20000/` **読まない**
- `ISO-22000` — `steward/standards/iso/ISO-22000/` **読まない**
- `ISO-22301` — `steward/standards/iso/ISO-22301/` **読まない**
- `ISO-37001` — `steward/standards/iso/ISO-37001/` **読まない**
- `ISO-45001` — `steward/standards/iso/ISO-45001/` **読まない**
- `ISO-50001` — `steward/standards/iso/ISO-50001/` **読まない**

## 有効社内規程

- **REG-001** 役員報酬規程 — 施行: `docs/company/regulations/yakuin-hoshu-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-001-yakuin-hoshu/template.md`
- **REG-002** 取締役会議事規則 — 施行: `docs/company/regulations/torishimari-kai-gijisho-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-002-torishimari-kai/template.md`
- **REG-003** 株主総会議事規則 — 施行: `docs/company/regulations/shukai-gijisho-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-003-shukai-gijisho/template.md`
- **REG-004** 稟議・決裁規程 — 施行: `docs/company/regulations/ringi-kessai-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-004-ringi-kessai/template.md`
- **REG-005** 経費精算規程 — 施行: `docs/company/regulations/keihi-seisan-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-005-keihi-seisan/template.md`
- **REG-006** 利益相反取引規程 — 施行: `docs/company/regulations/riekisohan-torihiki-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-006-riekisohan/template.md`
- **REG-007** 文書管理規程 — 施行: `docs/company/regulations/bunsho-kanri-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-007-bunsho-kanri/template.md`
- **REG-008** 旅費規程 — 施行: `docs/company/regulations/ryohi-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-008-ryohi/template.md`
- **REG-009** 情報セキュリティ管理規程 — 施行: `docs/company/regulations/joho-security-kanri-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-009-joho-security/template.md`
- **REG-010** 個人情報保護規程 — 施行: `docs/company/regulations/kojin-joho-hogo-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-010-kojin-joho/template.md`
- **REG-011** 品質管理規程 — 施行: `docs/company/regulations/hinshitsu-kanri-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-011-hinshitsu/template.md`
- **REG-014** 環境・エネルギー管理規程 — 施行: `docs/company/regulations/kankyo-energy-kanri-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-014-kankyo-energy/template.md`
- **REG-016** 内部監査規程 — 施行: `docs/company/regulations/naibu-kansa-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/core/REG-016-naibu-kansa/template.md`
- **REG-012** 宿泊運営・サステナビリティ規程 — 施行: `docs/company/regulations/shukuhaku-unyo-kisoku.md` · テンプレ: `steward/jurisdiction-packs/JP/regulations/templates/by-module/hospitality/REG-012-shukuhaku-unyo/template.md`

## 無効社内規程（読取禁止）

- `REG-013` 事業継続・危機管理規程 — `docs/company/regulations/jigyo-keizoku-kisoku.md` · テンプレ **読まない**（regulations.yaml で無効）
- `REG-015` 安全衛生管理規程 — `docs/company/regulations/anzen-eisei-kanri-kisoku.md` · テンプレ **読まない**（regulations.yaml で無効）
- `REG-017` 食品安全衛生管理規程 — `docs/company/regulations/shokuhin-anzen-kanri-kisoku.md` · テンプレ **読まない**（regulations.yaml で無効）
- `REG-018` 診療情報管理規程 — `docs/company/regulations/shinryo-joho-kanri-kisoku.md` · テンプレ **読まない**（regulations.yaml で無効）
- `REG-019` 現場安全衛生規程 — `docs/company/regulations/genba-anzen-kanri-kisoku.md` · テンプレ **読まない**（regulations.yaml で無効）
- `REG-020` 労働派遣管理規程 — `docs/company/regulations/haken-rodo-kanri-kisoku.md` · テンプレ **読まない**（regulations.yaml で無効）
- `REG-021` 受講者情報管理規程 — `docs/company/regulations/jugyo-joho-kanri-kisoku.md` · テンプレ **読まない**（regulations.yaml で無効）
- `REG-022` EC取引規程 — `docs/company/regulations/ec-torihiki-kisoku.md` · テンプレ **読まない**（regulations.yaml で無効）
- `REG-023` 配送・倉庫管理規程 — `docs/company/regulations/haiso-soko-kanri-kisoku.md` · テンプレ **読まない**（regulations.yaml で無効）
- `REG-024` 会員管理規程 — `docs/company/regulations/kaiin-kanri-kisoku.md` · テンプレ **読まない**（regulations.yaml で無効）

## 未バインドカタログ（読取禁止）

- `event_operations` — `modules.yaml` 未登録 · **読まない**
- `jp_carbon_neutral_2050` — `modules.yaml` 未登録 · **読まない**
- `jp_privacy_policy` — `modules.yaml` 未登録 · **読まない**
- `jp_subsidy_application` — `modules.yaml` 未登録 · **読まない**
- `jp_trademark_application` — `modules.yaml` 未登録 · **読まない**
- `jp_women_empowerment` — `modules.yaml` 未登録 · **読まない**
- `language_bridge` — `modules.yaml` 未登録 · **読まない**
- `real_estate_brokerage` — `modules.yaml` 未登録 · **読まない**
- `software_outsourcing` — `modules.yaml` 未登録 · **読まない**

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
- カタログ: `steward/modules/00-このフォルダについて.md` · `steward/jurisdiction-packs/JP/regulations/catalog.yaml`
