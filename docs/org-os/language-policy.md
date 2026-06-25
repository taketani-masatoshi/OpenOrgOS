# OpenOrgOS Language Policy

**Status:** canonical doctrine · **Parent:** [openorgos-core-philosophy.md](openorgos-core-philosophy.md)  
**Implementation registry:** [steward/locale/registry.yaml](../../steward/locale/registry.yaml) · `src/lib/locale.ts`

---

## 日本語要約

| 層 | 言語 | 役割 |
|----|------|------|
| **Core** | English | プロトコル · 型 · API · 設計文書の正本 |
| **Strategic Official Communities** | Japanese · Portuguese · Spanish · Chinese · Estonian | 公式コミュニティ · 法域 pack · 優先翻訳 · レビュー付き |
| **Community-supported** | French · German · Russian | コミュニティ維持 · ベストエフォート · 公式 SLA 外 |

**原則:** ガバナンスは English · 実行（テナント MD · 規程施行文 · Agent 要約）はローカル言語。

---

## Motto

**Govern in English. Execute locally.**

One governance language. Many execution languages.

---

## Three tiers

### 1. Core — English

English is the **only authoritative language** for:

| Artifact | Examples |
|----------|----------|
| Protocol & types | Schema field names · CLI flags · module ids |
| Core concepts | Organization · Role · Authority · Policy · Audit |
| Governance docs | `docs/org-os/` · ADRs · pack contracts |
| Core Agent definitions | `steward/core/agents/*.md` (English role names) |
| API & code comments (public surface) | Exported types · OpenOrgOS-facing APIs |

Rules:

- New Core artifacts are written in English first.
- Translations of Core docs are **non-authoritative** unless explicitly marked otherwise.
- Core must not embed locale-specific legal or industry terms as canonical identifiers.

### 2. Strategic Official Communities

Official community languages with **maintainer review** and **release parity** targets:

| Language | ISO / BCP 47 | Steward registry key | Primary communities |
|----------|--------------|----------------------|---------------------|
| Japanese | `ja` · `ja-JP` | `ja` | JP pack · mal tenant |
| Portuguese | `pt` · `pt-BR` / `pt-PT` | `pt` *(planned)* | BR · PT adapters |
| Spanish | `es` · `es-ES` / `es-MX` | `es` *(planned)* | LATAM · ES adapters |
| Chinese | `zh` · `zh-Hans` · `zh-Hant` | `zh-Hans` · `zh-Hant` | CN · HK · TW |
| Estonian | `et` · `et-EE` | `et` | EE pack · ee-demo |

Scope for Strategic Official:

- Jurisdiction pack templates (REG · seed · agent.md)
- Official community documentation mirrors
- Agent summaries when `display_language` matches
- `business-capability-catalog` and adapter-level catalogs
- Steward CLI user-facing messages for supported locales *(phased)*

SLA (target):

- Breaking Core changes → Strategic docs updated within the same release train.
- New jurisdiction pack → at least one Strategic language for that region before `pack_ready`.

### 3. Community-supported

Maintained by contributors; **no release-blocking SLA**:

| Language | ISO / BCP 47 | Steward registry key | Notes |
|----------|--------------|----------------------|-------|
| French | `fr` · `fr-FR` | `fr` *(planned)* | EU subdivisions · community PRs |
| German | `de` · `de-DE` | `de` | EU · already in registry |
| Russian | `ru` · `ru-RU` | `ru` | RU pack · already in registry |

Rules:

- Community translations must not override English Core definitions.
- PRs welcome; maintainers review for factual accuracy, not full parity.
- Missing Community-supported strings fall back to **English**.

---

## Two axes (unchanged)

Language policy does **not** replace the jurisdiction / display split:

| Axis | Config | Drives |
|------|--------|--------|
| **Legal (jurisdiction)** | `tenant.yaml` → `jurisdiction` | Which country adapter · tax schema · REG catalog |
| **Display (locale)** | `display_language` · `locale` | UI labels · Agent summary language · draft language for tenant docs |

Example: **JP jurisdiction + English display** — Japanese law, English execution UI.

Example: **HK jurisdiction + zh-Hant display** — Hong Kong law, Traditional Chinese execution.

See [jurisdiction-pack-contract.md](jurisdiction-pack-contract.md) · [steward/locale/00-このフォルダについて.md](../../steward/locale/00-このフォルダについて.md).

---

## Content placement matrix

| Content type | Authoritative language | Translation tier |
|--------------|------------------------|------------------|
| OpenOrgOS Core philosophy | English | Strategic mirrors optional |
| `steward/core/**` | English | — |
| Country adapter protocol | English + Strategic for region | Strategic Official |
| Industry module agent.md | English title · local execution notes OK | Strategic / Community |
| Tenant `data/*.yaml` | Local (any tier) | Organization choice |
| Tenant `docs/**` enacted REG | Local execution language | Organization choice |
| Agent summaries `docs/reports/` | `display_language` | L1 · no L2 leakage |
| Git commit messages (Core repo) | English preferred | — |

---

## Registry alignment

Current [steward/locale/registry.yaml](../../steward/locale/registry.yaml) vs this policy:

| Tier | Language | In registry today | Action |
|------|----------|-------------------|--------|
| Core | English | `en` ✓ | — |
| Strategic | Japanese | `ja` ✓ | — |
| Strategic | Chinese | `zh-Hans` · `zh-Hant` ✓ | — |
| Strategic | Estonian | `et` ✓ | — |
| Strategic | Portuguese | — | Add `pt` when BR/PT pack ships |
| Strategic | Spanish | — | Add `es` when ES/LATAM pack ships |
| Community | German | `de` ✓ | Mark `tier: community_supported` in registry |
| Community | Russian | `ru` ✓ | Mark `tier: community_supported` in registry |
| Community | French | — | Add `fr` when community lane opens |
| TJS-11 (non-tier) | Malay · Arabic | `ms` · `ar` ✓ | Jurisdiction-required display · not Strategic tier |

**Note:** TJS-11 mandatory languages (e.g. `ms`, `ar`) serve **jurisdiction display requirements** and are orthogonal to Strategic / Community tiers. They may overlap (e.g. Estonian is both Strategic and EE jurisdiction).

---

## Extension rules

Before adding a language to **Strategic Official**:

1. Is there a committed maintainer group?
2. Is there a country adapter or ≥1 official tenant using it?
3. Can REG templates and CLI messages be reviewed each release?

Before adding to **Community-supported**:

1. Document fallback to English.
2. Add `registry.yaml` entry with `tier: community_supported`.
3. Do not block releases on translation completeness.

**Never** add country-specific law terminology to Core English identifiers — use adapter-local labels only.

---

## Related documents

| Document | Role |
|----------|------|
| [openorgos-core-philosophy.md](openorgos-core-philosophy.md) | Governance language · extension order |
| [layer-mapping-steward-os.md](layer-mapping-steward-os.md) | Where localized content lives |
| [tjs-11-target-jurisdictions.md](tjs-11-target-jurisdictions.md) | Mandatory display languages per pack |
| [language_bridge module](../../steward/modules/language_bridge/) | User language ≠ record language |

---

## Version

| Field | Value |
|-------|-------|
| policy_version | 1 |
| effective | 2026-06-25 |
| owner | steward-os/core-maintainers |
