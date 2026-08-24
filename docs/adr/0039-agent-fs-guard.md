# ADR 0039: Agent filesystem write gate (Ed25519 identities)

- **Status:** Accepted
- **Date:** 2026-08-24
- **Deciders:** OrgOS maintainers

## Context

Multiple AI agents (AIA) can run in parallel against the same tenant YAML/MD tree. Folder policy and capability `data_paths` describe who *should* write, but they are not a mechanical gate. Last-write-wins on shared files (cash, contracts, calendar) is incompatible with SSOT and Event First.

Human operator grants already exist (`data/org/access-grants.yaml`, `GRN-*`). They bind **operators**, not Agent identities, and they are not signed.

Giving each Agent a copy of canonical data would violate SSOT. An LLM Agent that “holds” a private key in context can sign arbitrary writes.

## Decision

1. Enforcement is a **deterministic CLI**, not a new LLM Agent. Catalog Agent `security` reviews the table; `orgos guard` is the only writer of grants and the only AIA path onto canonical files.
2. Each Agent has an **Ed25519** identity. The public key is tracked in `data/org/agent-identities.yaml`. The private key lives on the host (`~/.orgos/agents/{tenant}/{agent}.pem` or tenant `data/.orgos/`, mode 0600) and is loaded only by the CLI runtime.
3. A tenant **issuer** key signs grant events (`agent.grant.issued` / `agent.grant.revoked`) into append-only `data/org/fs-guard-events.jsonl`. `data/org/fs-guard-grants.yaml` is a derived snapshot.
4. `orgos guard apply` signs a write intent with the Agent key, checks an active grant + classification `write_agents` overlay, then writes. **`--expected-sha256` is required** (compare-and-swap on the current file; new files use sha256 of the empty string). Shared canonical YAML also takes a short exclusive lease. Dispatch (`context.path`) and Skill YAML/MD writes (`writeYamlFile` / `writeTrackedFile` under agent context) call the same policy when the gate is on. The LLM tool `operator_guard_apply` is the sanctioned AIA canonical write (`expected_sha256` required) and does **not** require `ORGOS_LLM_TOOLS_WRITE`.
5. Grant administration requires `guard:admin` (ceo / approver) when operator auth is on. Agents cannot grant themselves.
6. Non-production: until `orgos guard init`, the gate is off (backward compatible). `ORGOS_FS_GUARD=off` disables; `enforce` requires init. **Production** refuses startup, `orgos doctor`, and **canonical write boundaries** (`wrapCanonicalWrite`, `applyAgentWrite`) if uninitialized, and forbids `ORGOS_FS_GUARD=off`. `requireCliOperator` also fails early. `guard init` is the exception. Platform paths (`data/.orgos/`, `data/chat/`, `data/scratch/`) skip prod/init checks so init can bootstrap.
7. Shell dispatch cwd is the AIA run workspace (`data/scratch/aia-runs/{run_id}`). `runtime.yaml` keeps `{tenant_root}` for profile integrity; **`runShellDispatch` overwrites cwd** when enforced. Redirects/`cp`/`mv` onto canonical paths are rejected. **argv[0] allowlist** (echo · aider · cat from `runtime.yaml`) blocks interpreter one-liners (`python -c`, `node -e`). Child processes (aider) can still write arbitrary absolute paths — residual risk; OS sandbox is a follow-up.
8. Path classes: **platform** (skip grant/prod), **agent_forbidden** (Agent context and `guard apply` always denied: identities, grant ledger, `operators.yaml`, `access-grants.yaml`, protocol signing keys / witness-trust), **gated** (grant required). Other `data/org/**` (module-messages, pending-approvals, aia-queue) is gated.
9. Unhooked direct `writeFileSync` / `cpSync` etc. are frozen via `canonical-write-baseline.ts` + `npm run check:canonical-writes`. Batch-1 writers (operators, access-grants, regulation-bindings, aia-queue, routing-queue results, scheduling handoffs) now use hooked writers.
10. Agent context propagation: Cursor SDK dispatch (`runCursorTask`), `operator_guard_apply` / `operator_run_command` (when `ctx.agentId`), Skill `moduleId` fallback when `agent_id` is absent. Steward Chat / MCP `runOperatorAsk` stays human-session (production already forbids `ORGOS_LLM_TOOLS_WRITE=1`).

Canonical company folders stay type-based (`data/finance/`, `docs/contracts/`). Isolation is capability + signature, not a second copy of SSOT.

## Consequences

### Positive

- AIA file writes become auditable (event log + content hash + agent key id).
- Forged or out-of-scope writes fail closed after init.
- Reuses protocol-style Ed25519 and existing glob matching.

### Negative / follow-ups

- WebAuthn challenge/credential stores stay in `.orgos` (platform path). They are not Agent-grant scoped.
- YAML/MD hooks enforce grant + lease, not CAS. CAS remains mandatory on `guard apply` / `operator_guard_apply` / `writeTenantContentGuarded`.
- `writeTenantContentGuarded` requires a caller-supplied `expectedSha256` (CLI hashes the destination at invoke time; LLM tools must pass the revision they read).
- Shell blocks cwd outside `data/scratch/aia-runs/` and obvious redirects/`cp` onto canonical paths. A subprocess can still write an absolute path the scanner does not see.
- **P2 follow-ups:** asymmetric CAS on hook writers · lease TTL · read-grant dead code · issuer/agent key rotation · import-cycle hardening · finer `--seed` granularity.
