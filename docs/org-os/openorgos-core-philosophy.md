# OpenOrgOS Core Philosophy

**Status:** canonical doctrine · **Language:** English (authoritative)  
**Scope:** OpenOrgOS Core design — not application features  
**Terminology (JP):** [orgos-vocabulary.md](orgos-vocabulary.md) — **OrgOS = product** · **Steward Agent** = executive core agent (not the product name)

You are developing the OpenOrgOS Core.

OpenOrgOS is not a SaaS product.

OpenOrgOS is **not** an operating system for **internal** organization management.

OpenOrgOS **is** a **global protocol for inter-organizational communication**.

## What Core defines (only four)

The protocol kernel specifies **nothing else** at the normative level:

| Core artifact | Role |
|---------------|------|
| **Org Event Model** | Canonical schema for organizational signals crossing boundaries — typed events, envelopes, ordering, and correlation |
| **Identity exchange** | How organizations and authorized actors present and verify who they are to peers |
| **Authority delegation** | How binding authority is granted, scoped, revoked, and proven across org boundaries |
| **Auditability** | How actions, states, and event chains produce evidence that third parties can verify |

Decisions, obligations, policies, and workflows **may appear as event types or payloads** inside the Org Event Model — they are **not** separate Core domains unless they serve cross-org exchange.

## What Core does not define

**All** of the following are **delegated** — never specified in Core:

| Delegated concern | Owner |
|-------------------|--------|
| Business logic | **Domain-specific committees** (industry adapters) |
| Legal interpretation | **National committees** (country adapters) |
| Organizational behavior | National + domain committees · tenant implementations |

**National committees** maintain country adapters (e.g. OpenOrgOS-JP, OpenOrgOS-US).  
**Domain-specific committees** maintain industry adapters (e.g. OpenOrgOS-Medical, OpenOrgOS-Finance).

Core provides **wire semantics**. Committees provide **meaning and behavior**.

Internal payroll, inbox filing, and single-tenant ERP workflows are **not** the protocol.
They live under committee-maintained adapters or Organization Implementations.

The closest analogies are:

- Linux
- Git
- Kubernetes
- **TCP/IP** *(inter-org protocol — primary analogy)*
- POSIX

The system must be designed as **infrastructure and protocol**, not application software.

## Mission

Create the **global inter-organizational protocol kernel** — Org Event Model · identity exchange · authority delegation · auditability.

Committees implement everything else.

## Fundamental Principle

What belongs in **Core** — only what every peer org needs to **communicate verifiably**:

1. Org Event Model  
2. Identity exchange  
3. Authority delegation  
4. Auditability  

What belongs in **national committees** — law, compliance interpretation, country-specific behavior.

What belongs in **domain committees** — sector business logic, industry semantics.

What belongs in **Implementations** — single-organization runtime and internal management.

**Internal-only features must never become protocol requirements.**

## Layer Model

```
OpenOrgOS Core          ← Org Event Model · identity · authority · audit
    ↓
National Committee      ← country adapter (legal interpretation · national behavior)
    ↓
Domain Committee        ← industry adapter (business logic · sector behavior)
    ↓
Organization Implementation
```

Legacy shorthand (same layers):

```
OpenOrgOS Core → Country Adapter → Industry Adapter → Organization Implementation
```

Example:

```
OpenOrgOS Core
    ↓
Japan Adapter
    ↓
Medical Adapter
    ↓
Southwood Organization
```

Another example:

```
OpenOrgOS Core
    ↓
US Adapter
    ↓
Startup Adapter
    ↓
YC Company
```

## Core Responsibilities

The Core normative surface is **exactly four**:

### 1. Org Event Model

- Event types, envelopes, IDs, timestamps, correlation
- Subscription / delivery semantics at the protocol boundary
- No sector-specific event payloads in Core — committees extend payloads

### 2. Identity exchange

- Organization identity presentation and verification hooks
- Actor identity bound to organization context
- No national ID schemes in Core — committees map legal identity

### 3. Authority delegation

- Delegation grants, scopes, expiry, revocation
- Proof that an actor may bind the organization to peers
- No approval matrices or board rules in Core — committees encode governance

### 4. Auditability

- Append-only evidence chains tied to events and delegations
- Verification hooks for third parties
- No retention law or audit checklist content in Core — committees define compliance

Supporting types (Organization · Person · Role · Policy · …) exist only as **serialization helpers** for the four artifacts above — not as independent Core domains.

The Core must never contain:

- Business logic
- Legal interpretation
- Organizational behavior rules
- Tax · labor · accounting · contracts as domain law
- Country-specific or industry-specific regulations
- Internal-only workflows with no inter-org interface

**National and domain committees** own all of the above.

## Language Policy

Core concepts are written in English.

English is the canonical language of the protocol.

Examples:

OrgEvent · IdentityExchange · AuthorityDelegation · AuditRecord · EventEnvelope

Translations are optional. English definitions are authoritative.

## Extension Philosophy

Never solve local problems in the Core.

Always expose extension points.

Preferred order:

1. Plugin
2. Module
3. Adapter
4. Hook
5. Event
6. API

Avoid:

- hardcoded country logic
- special cases
- exceptions
- regional branches

If a feature is only useful for one country, it does not belong in Core.

## National Committee Philosophy

**National committees** maintain country adapters. They convert national law into protocol-compatible behavior.

Examples:

- OpenOrgOS-JP committee → labor law · company law · pharmaceutical law
- OpenOrgOS-US committee → Delaware corporation law · federal overlays
- OpenOrgOS-EU committee → GDPR · subdivision packs

Core does not interpret law. Committees do.

## Domain Committee Philosophy

**Domain-specific committees** maintain industry adapters. They own sector business logic and organizational behavior within a domain.

Examples:

- OpenOrgOS-Medical → ISO13485 · QMS · SaMD lifecycle
- OpenOrgOS-Finance → SOX · AML · KYC semantics

Core does not encode business rules. Committees do.

## Country / Industry Adapter (implementation)

Country adapters and industry adapters in this repository are the **reference implementations** maintained by or for committees — not substitutes for committee governance.

## Architectural Principle

- **Protocol over implementation**
- **Inter-org exchange over internal management**
- Interfaces over behavior
- Composition over inheritance
- Federation over centralization
- Adapters over exceptions
- **Verifiability over convenience**

## Protocol vs internal management

| Layer | Question | Example |
|-------|----------|---------|
| **Core (protocol)** | Can another org verify or consume this? | Signed decision record · obligation receipt · audit trail export |
| **Adapter / Module** | Is this local law or sector process? | JP 商標登録願 · clinic appointment billing |
| **Implementation** | Is this one tenant's private ops? | MAL 月次 YAML · travel draft · cash balance |

If a feature only helps **one organization run itself**, it is not Core protocol — even if it is valuable software.

## Linux / TCP/IP Analogy

Linux kernel does not know:

- Japanese tax law
- hospital workflows
- corporate governance rules

**TCP/IP** does not manage your office LAN — it defines how packets cross networks with verifiable headers.

OpenOrgOS Core behaves the same way:

- **Org Event Model** + identity · authority · audit — the wire
- **National committees** — legal meaning
- **Domain committees** — business meaning
- **Organization Implementations** — internal management runtime

Organizations are **peers on the protocol**, not tenants of a central SaaS.

## Development Philosophy

The Core should remain:

- small
- stable
- predictable
- backward compatible

New features should prefer modules rather than kernel changes.

Kernel bloat is organizational debt.

## Governance Philosophy

Governance discussions occur in English.

Execution occurs in local languages.

One governance language.

Many execution languages.

**Language tiers:** [language-policy.md](language-policy.md)

## Design Questions

Before adding anything to Core ask:

1. Is it one of the **four Core artifacts** (Org Event Model · identity exchange · authority delegation · auditability)?
2. Would this exist in **every country** and **every industry** as wire semantics?
3. Would this still exist in **50 years**?
4. Can a **national or domain committee** own this instead?

If the answer is **no** to question 1, or **yes** to question 4: **Do not put it in Core.**

If the feature is business logic, legal interpretation, or organizational behavior: **Committees or Implementations — never Core.**

## Final Mental Model

```
Linux Kernel → Device Drivers → Distributions → Applications
```

becomes

```
OpenOrgOS Core → National Committees → Domain Committees → Organizations
```

(Legacy path names: Country Adapter · Industry Adapter · Organization Implementation)

## Motto

One protocol. Many implementations.

**Exchange globally. Operate locally.**

Global principles. Local autonomy.

Design globally. Implement locally.

Govern universally. Comply locally.

Verify across boundaries. Manage within boundaries.

---

**Steward OS mapping:** [layer-mapping-steward-os.md](layer-mapping-steward-os.md)
