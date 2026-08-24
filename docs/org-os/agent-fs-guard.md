# Agent filesystem write gate

AIA（LLM Agent）がテナント正本を書き換えるときの **決定論ゲート**。正本 ADR: [0039-agent-fs-guard.md](../adr/0039-agent-fs-guard.md)

人間オペレータの期限付き権限は別系統（`data/org/access-grants.yaml` · `GRN-*`）です。

## 原則

- LLM は秘密鍵を持たない。鍵はホスト上の CLI ランタイムだけが読む。
- 正本フォルダは会社の種別のまま（`data/finance/` など）。Agent 専用の正本コピーは作らない。
- 許可は **発行者署名付き grant イベント** から導く。上書き履歴は捨てない。
- 新 LLM Agent は作らない。強制は `orgos guard`。Security Agent は台帳の監査のみ。
- 正本への適用はパッチ + **必須 CAS**。ファイル全体の無条件上書きは競合を隠す。
- 共有 YAML は短い排他リース（他 Agent が保持中なら fail-closed）。

## 3 面

| 面 | 置き場 | 誰が書く |
|---|---|---|
| Run | `data/scratch/aia-runs/{run_id}` | AIA / Shell（cwd もここ） |
| Proposal | パッチ + 現在 sha256 | Agent が提案、ランタイムが検証 |
| Canonical | `data/` `docs/` `records/` | `orgos guard apply` のみ（Skill YAML は grant + リース） |

## 鍵と台帳

| 物 | 置き場 | Git |
|---|---|---|
| Issuer 秘密鍵 | `tenants/{id}/data/.orgos/fs-guard-issuer.pem` | ignore |
| Agent 秘密鍵 | `~/.orgos/agents/{tenant}/{agent}.pem` | リポ外 |
| 公開鍵レジストリ | `data/org/agent-identities.yaml` | 追跡 |
| Grant イベント（SSOT） | `data/org/fs-guard-events.jsonl` | 追跡 |
| Grant スナップショット | `data/org/fs-guard-grants.yaml` | 追跡（導出） |
| Apply 監査 | `data/org/fs-guard-applies.jsonl` | 追跡（grant イベントとは混ぜない） |
| Canonical リース | `data/.orgos/canonical-leases.json` | ignore |

Apply 記録は Agent 鍵で署名した write intent の監査です。Grant 導出は **Issuer** 署名の grant イベントだけを見ます。

## CLI

```bash
orgos guard init --seed          # issuer + capability から write grant を発行
orgos guard keygen --agent finance
orgos guard grant --agent finance --path 'data/finance/**' --op write
orgos guard list
orgos guard check --agent finance --path data/finance/cash-balance.yaml --op write
orgos guard hash --path data/finance/monthly/2026-08.yaml
orgos guard apply --agent finance --path data/finance/monthly/2026-08.yaml --from ./draft.yaml \
  --expected-sha256 <current-file-sha256>
orgos guard revoke --id AGRNT-20260824-001
```

`guard init` / `grant` / `revoke` / `keygen` は本番で `guard:admin`（ceo / approver）。

`apply` は Agent 秘密鍵で intent に署名する。鍵が無いホストでは失敗する。

`--expected-sha256` は **必須**。宛先の **現在** の内容の SHA-256。無いファイルは空文字のハッシュ（`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`）。不一致は `revision_conflict`。現在値は `orgos guard hash --path` で取る。

## 本番

- `ORGOS_ENV=production`（または `ORGOS_PROD=1` / `NODE_ENV=production`）では **未 init を起動拒否**（prod-checklist · `orgos doctor`）。
- 本番で `ORGOS_FS_GUARD=off` は禁止（ゲートも無効化しない）。
- 本番 CLI の mutation（`requireCliOperator`）は未 init を拒否。例外は `guard init`。
- **書込境界**（`wrapCanonicalWrite` · `applyAgentWrite`）でも本番未 init を拒否。platform 面（`.orgos` · `chat` · `scratch`）のみ init 前も通過。`data/org/operators.yaml` · `access-grants.yaml` は init 前の本番チェックから免除（**agent_forbidden** は維持）。
- 非本番の未 init はオフ（既存テナントを壊さない）。init 済み、または `ORGOS_FS_GUARD=enforce` ならオン。

## ランタイム内部スコープ

Guard ランタイム自身が台帳へ書く処理（`saveIdentities` · grant イベント · apply 監査）は **`runFsGuardInternal`** で包み、`wrapCanonicalWrite` をスキップする（公開 API からは export しない）。これにより `operator_guard_apply` / `guard init` が対象ファイル書込後に監査追記で失敗しない。LLM / Skill から台帳を直接 `writeYamlFile` する経路は引き続き **agent_forbidden** で拒否される。

## パス三分類

| 分類 | 例 | Agent コンテキスト |
|---|---|---|
| platform | `data/.orgos/` · `data/chat/` · `data/scratch/` | grant 不要（prod も skip） |
| agent_forbidden | identities · fs-guard 台帳 · `operators.yaml` · `access-grants.yaml` · protocol 鍵 | **常に拒否**（人間 CLI は可） |
| gated | その他 `data/` `docs/` `records/` | grant + リース |

## AIA の使い方

1. 下書きは Run 面（`data/scratch/aia-runs/{run_id}`）に書く。Shell cwd もここ（enforce 時はコードが cwd を run workspace に上書き。`runtime.yaml` は `{tenant_root}` のまま）。シェル interpreter（`bash` 等）経由のリダイレクト/`cp`/`install` による正本書きは拒否。`echo` 等の非シェル argv は走査しない。argv[0] は runtime allowlist（echo · aider · cat）のみ。
2. 正本へ入れるときは **LLM がファイルを直接保存せず** 次のいずれか:
   - ランタイムが `orgos guard apply --agent <id> --path <logical> --from <draft> --expected-sha256 <hex>` を呼ぶ
   - Steward Chat の `operator_guard_apply`（`agent:dispatch` · `expected_sha256` 必須。`ORGOS_LLM_TOOLS_WRITE` は不要）
3. Work Order に `context.path` がある dispatch は、enforce 時に同じ grant を見る。
4. Skill CLI（`orgos skills run`）は `skill.agent_id`（無い場合は `moduleId` からモジュール Agent）を AsyncLocalStorage に載せ、`writeYamlFile` / `writeTrackedFile` が grant + リースを見る。Cursor SDK dispatch も同様に Agent を伝播。

未フックの直接 `writeFileSync` は `npm run check:canonical-writes` で baseline 凍結（`orgos doctor` が残件数を warn）。

環境変数:

- `ORGOS_FS_GUARD=off` — ゲート無効（本番禁止）
- `ORGOS_FS_GUARD=enforce` — init 必須（非本番でも強制）
- `ORGOS_FS_GUARD_AGENT` — 実行中の Agent id（dispatch / Skill がセット。シェル子プロセスへ継承）

人間 CLI（Agent コンテキストなし）はゲートを通さない。

プラットフォームとしてスキップするパス（grant 不要）:

- `data/.orgos/` · `data/chat/` · `data/scratch/`
- `data/org/agent-identities.yaml` · `fs-guard-events.jsonl` · `fs-guard-grants.yaml` · `fs-guard-applies.jsonl`

`data/org/module-messages/` · `pending-approvals.yaml` · `aia-runtime.yaml` などは **ゲート対象**。

## 分類レジストリとの関係

Grant があっても、`classification-registry.yaml` に載っているパスは `write_agents` を満たす必要がある。未登録パスは grant のみ。
