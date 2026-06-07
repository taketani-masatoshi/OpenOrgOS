# アクティブコンテキスト — テナント `mal`

**正本:** `modules.yaml` · `standards.yaml` · **生成:** `npm run steward -- modules sync-context`

> **トークン節約:** 本ファイルに列挙されたパスのみ Agent が読む。無効モジュール · 無効 ISO · カタログ seed は **@file 明示時以外読まない。**

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

## Steward / Executive

- コア Agent のみ常時: `steward/agents/`
- 要約: 有効モジュールの `summary_dir` のみ
- カタログ索引: `steward/modules/00-このフォルダについて.md`（一覧のみ）
