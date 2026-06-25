# OpenOrgOS Core Philosophy

**Status:** canonical doctrine · **Language:** English (authoritative)  
**Scope:** OpenOrgOS Core design — not application features

You are developing the OpenOrgOS Core.

OpenOrgOS is not a SaaS product.

OpenOrgOS is an organizational operating system.

The closest analogies are:

- Linux
- Git
- Kubernetes
- TCP/IP
- POSIX

The system must be designed as infrastructure rather than application software.

## Mission

Create the Linux kernel for organizations.

The core should provide only universal primitives.

Everything else should be implemented as modules.

## Fundamental Principle

What is universal belongs in Core.

What is local belongs in Adapters.

What is organizational belongs in Implementations.

## Layer Model

```
OpenOrgOS Core
    ↓
Country Adapter
    ↓
Industry Adapter
    ↓
Organization Implementation
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

The Core owns only universal concepts.

Examples:

- Organization
- Person
- Identity
- Role
- Authority
- Permission
- Delegation
- Responsibility
- Decision
- Policy
- Capability
- Contribution
- Audit
- Versioning
- Governance
- Workflow Engine

These concepts must be globally reusable.

The Core must never contain:

- tax rules
- labor law
- accounting standards
- legal contracts
- country-specific regulations
- industry regulations

Those belong elsewhere.

## Language Policy

Core concepts are written in English.

English is the canonical language of the protocol.

Examples:

Organization · Role · Authority · Decision · Policy · Contribution · Audit · Capability

Translations are optional.

English definitions are authoritative.

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

## Country Adapter Philosophy

Country adapters convert law into protocol.

Examples:

- OpenOrgOS-JP
- OpenOrgOS-US
- OpenOrgOS-EU
- OpenOrgOS-BR

Examples of adapter responsibilities:

**Japan:** labor law · company law · medical law · pharmaceutical law

**EU:** GDPR

**US:** Delaware corporation law

Core should not understand these concepts.

Core only provides interfaces.

## Industry Adapter Philosophy

Industry-specific rules belong in industry adapters.

Examples:

- OpenOrgOS-Medical
- OpenOrgOS-Finance
- OpenOrgOS-Manufacturing
- OpenOrgOS-Education

Examples:

**Medical:** ISO13485 · QMS · SaMD lifecycle

**Finance:** SOX · AML · KYC

Again: Core should not understand these concepts.

## Architectural Principle

- Protocol over implementation
- Interfaces over behavior
- Composition over inheritance
- Federation over centralization
- Adapters over exceptions

## Linux Analogy

Linux kernel does not know:

- Japanese tax law
- hospital workflows
- corporate governance rules

Linux exposes interfaces.

Drivers implement behavior.

OpenOrgOS should behave the same way.

Country adapters are device drivers for legal systems.

Industry adapters are device drivers for business domains.

Organizations are runtime configurations.

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

1. Would this exist in every country?
2. Would this exist in every industry?
3. Would this still exist in 50 years?
4. Can this be implemented as an adapter?
5. Can this be implemented as a plugin?

If the answer is yes to 4 or 5: **Do not put it in Core.**

## Final Mental Model

```
Linux Kernel → Device Drivers → Distributions → Applications
```

becomes

```
OpenOrgOS Core → Country Adapters → Industry Adapters → Organizations
```

## Motto

One protocol. Many implementations.

Global principles. Local autonomy.

Design globally. Implement locally.

Govern universally. Comply locally.

---

**Steward OS mapping:** [layer-mapping-steward-os.md](layer-mapping-steward-os.md)
