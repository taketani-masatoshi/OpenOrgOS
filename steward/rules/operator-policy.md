# OrgOS Operator Policy

**版:** 1.0 · **日付:** 2026-06-28  
**正本:** 本書（ツール非依存）· データ分類正本: テナント `data/classification-registry.yaml` · [folder_access_policy.md](folder_access_policy.md)

LLM オペレーター（Cursor · Cline · Aider · OpenHands · Steward Chat 等）が OrgOS workspace を操作するときの **必須ルール**。

---

## 1. 4 層と読取境界

```
CEO（人間）→ 判断 · 承認のみ
Executive Steward（LLM）→ dashboard / agent-summaries / executive-notes のみ
部門 Agent（LLM）→ 担当 Primary Folders のみ
Skill + CLI → 決定論処理（validate · 集計 · 生成）
Data → YAML/MD 正本
```

| 主体 | 読取 | 禁止 |
|------|------|------|
| **Executive Steward** | `docs/reports/dashboard/` · `agent-summaries/` · `executive-notes/` | `data/**/*.yaml` 直読 · 契約本文詳細 |
| **Secretary** | `data/executive/**` · 要約行のみ dashboard | `data/finance/**` · `data/contracts/**` · 受信ポーリング |
| **Mail Intake** | `mail-triage-queue.yaml` · `mail-received/`（@file のみ）· 分類ルール | 送信 · 承認 · L2 本文のチャット出力 |
| **Mail Outbound** | `correspondence-drafts/` · `mail-config` · `external-contacts` | 承認 · 未承認送信 · L2 本文のチャット出力 |
| **Finance / Contract / Compliance / Operations** | 各 `steward/core/agents/*_agent.md` の Primary Folders | 担当外編集 |
| **Operator（汎用 LLM）** | ユーザ指示 + Today コンテキスト + 担当 Agent 定義 | L2/L3 値の出力 · 全フォルダ一括 @ |

---

## 2. データ分類（L0–L3）

| レベル | AI 自動 | 出力禁止 |
|--------|---------|----------|
| L0–L1 | 可 | — |
| L2 | `@file` / 担当 Agent のみ | tracked MD · チャットへの転記 |
| L3 | 禁止 | L2 の要約混入 |

- 口座・個人住所は **`bank_account_id` / `stakeholder_id` リンクのみ**
- 振込実行は **`orgos broker transfer`** — チャットに口座番号を出さない

---

## 3. CLI 必須手順

データ変更後:

```bash
orgos validate
```

Work Order 完了前:

```bash
orgos validate
orgos escalate complete --id IMP-... --notes "..."
```

日次経営確認:

```bash
orgos chat today
# または
orgos dashboard
```

---

## 4. 承認ゲート

| 操作 | 主体 | CLI |
|------|------|-----|
| 組織間 wire 送信 | CEO / 承認者 | `protocol notice approve` |
| 内部稟議 | 承認者 | `org approval approve` |
| 最終決定 | **人間** | Agent は提案・下書きのみ。LLM / MCP は承認を実行しない |

---

## 4.1 Operator RBAC（registry 正本）

正本: `tenants/{id}/data/org/operators.yaml` · 実装: `src/lib/console-auth/operator-rbac.ts`

| Role | 主な permission |
|------|-----------------|
| `ceo` / `approver` | `chat:approve` · `chat:wire` · `protocol:approve` · `broker:transfer` · `finance:reconcile` |
| `ceo` / `operator` | `events:write`（`orgos events new/close/archive/void`） |
| `operator` | `chat:ask` · `escalate:*` · `agent:dispatch` · `agent:order` |
| `readonly` | `chat:read` のみ |
| `mcp_service` | 明示 tool のみ（既定 read + ask） |

- **HTTP（Chat / Wire BFF）** — session user → registry で permission 解決
- **MCP** — Bearer token → `key_hash` 照合（本番は operator 別 key）。Today / Ask / Witness のみ。承認ツールなし
- **CLI mutation** — `--operator-id` + `ORGOS_OPERATOR_KEY`（prod 必須 · `orgos operator init-registry`）
- **最終承認** — 認証済み `ceo` / `approver` の名義と `operator_id` をバインド。HumanApprovalContext（Chat/Wire UI または CLI 人間セッションのみ発行）。自己承認禁止。LLM / MCP は実行しない
- **会社イベント** — `events:write` 必須。`chain backfill --force` は復旧手段にしない（`ORGOS_EVENTS_CHAIN_REBUILD=1` + ceo + `--i-understand-rebuild` の破壊的隔離口のみ）
- **本番** — registry 空 · auth off · Wire dev passkey · `ORGOS_LLM_TOOLS_WRITE=1` は起動拒否（`orgos doctor` / prod-checklist）

---

## 4.1a ローカル LLM 向け変更ゲート（等級 A/B/C）

ローカル LLM（Ollama 等）は会社 YAML を **直接書き換えない**。意図は JSON/YAML → `orgos change plan` → dry-run → 人間確認 → `orgos change apply`。

正本スキーマ: `schemas/operator-change.ts` · 実装: `src/lib/operator-change/` · ADR: [0060](../../docs/adr/0060-local-llm-change-gates.md)

| 等級 | 例 | apply |
|------|-----|--------|
| **A** | `opened_date` / `max_guests` / hospitality `sync-derived` | dry-run 後、Steward Chat の確認カード（CommandActionCard）または CLI `--write` |
| **B** | 予実・宿泊税・滞在台帳の連動 | plan まで。apply は `--i-understand-grade-b` または人間セッションのみ |
| **C** | 損金設計・許可変更届・保険を外す | plan の論点メモのみ。**apply 禁止** |

- Chat スキル: `change_plan`（kind `read`）· `change_apply`（kind `write` → 既存どおり confirmation plan）
- 監査: `data/operator/change-audit.jsonl`（gitignore）
- ask のみ（tools なし）の応答経路は変更しない。黙って `data/**/*.yaml` を書く経路は増やさない

---

## 4.1b ローカル LLM ERROR フォールバック

worker `tier: local` の LLM 応答で、必要情報が prompt / tool 結果 / 添付に無いときは **「未確認」や拒否エッセイを出さず**、出力は **`ERROR: <理由>` の1行のみ**とする。

正本: [local-llm-error-fallback.md](local-llm-error-fallback.md) · 実装: `src/lib/operator-runtime/local-llm-error-fallback.ts` · ADR: [0061](../../docs/adr/0061-local-llm-error-fallback.md)

- runtime が `tool-loop` で block 注入 + 応答 enforce（`ORGOS_LOCAL_LLM_ERROR_FALLBACK=0` で無効）
- クラウド worker は従来 Grounding（未確認）を維持
- 意図的 `ERROR:` は Fact refusal guard で Work Order 起票しない

---

## 4.2 OOO / Operator Console ログイン制限（会社ドメイン）

会社の根幹（Operator Console）への Community SSO は、名簿照合に加え、テナントが宣言したログインメールドメインに限定する。

正本: `tenants/{id}/data/org/operators.yaml` の `login_policy` · 実装: `src/lib/org/ooo-login-email.ts` · 寿命: `data/org/tenant-lifecycle.yaml`

| 項目 | 意味 |
|------|------|
| `email_domains` | 人間オペレータの SSO メールが属する会社ドメイン（例: `malkk.com`） |
| `grandfather_emails` | **創業者1席のみ**（最大1件）。active ceo の email と一致必須。新規追加しない |
| `founder_migration` | 創業者 Gmail → 会社ドメイン移行枠（`status` · `grace_until` · `closed_at`） |

### 本鍵 / 第2鍵（PassKey）

| 鍵 | 用途 |
|----|------|
| **本鍵** | 会社ドメイン Community SSO |
| **第2鍵** | ログイン PassKey（Mac + 予備 iPhone、**operator あたり最大2** · `WIRE_CONSOLE_WEBAUTHN_ALLOW_ADDITIONAL_LOGIN=1`） |
| **Settlement PassKey** | 承認専用 — ログイン復旧に使わない |

故障時: SSO 本鍵で再ログイン → 壊れた login PassKey を credentials API で削除 → 再登録。

### 創業者ドメイン移行（CLI · 人間のみ）

```bash
orgos operator login-domain set --domain malkk.com   # 初回 domain 設定時 grace 90日
orgos operator founder-email status
orgos operator founder-email retire                 # ceo が会社メール SSO 確認後
```

- `grace_until` 超過かつ grandfather 残存 → validate warning（非 prod）/ error（prod）
- grandfather 残存中は **2人目の常勤人間を invite 不可**（retire 必須）

### 清算人席（`seat_kind: liquidator`）

- `liquidator@会社ドメイン` · `guest_expires_at` 必須 · 個人 grandfather 不可
- **tenant lifecycle `winding_down` 中のみ**追加可
- 延長は `winding_down.declared_at` から **最長24か月**

```bash
orgos tenant lifecycle declare-winding-down --operator-id OP-001
orgos operator liquidator add --email liquidator@malkk.com --until 2027-06-30 --display-name "清算人"
orgos operator liquidator extend --operator-id OP-LIQ-001 --until 2027-12-31 --reason "..."
```

### テナント寿命

正本: `tenants/{id}/data/org/tenant-lifecycle.yaml` · `active → winding_down → archived → purged`

| status | SSO | standing invite | liquidator |
|--------|-----|-----------------|------------|
| `active` | 通常 | 通常 | 不可 |
| `winding_down` | ceo/approver/liquidator のみ | 不可 | 可 |
| `archived` | 拒否 | 不可 | 不可 |

```bash
orgos tenant lifecycle status
orgos tenant lifecycle declare-winding-down --operator-id OP-001
orgos tenant lifecycle archive --export-id <export-id>
```

LLM / MCP は lifecycle · retire · liquidator extend を実行しない。

席の規則（役職ではなく席の種類）:

| 席 | メール |
|----|--------|
| ドメイン取得前の創業者 1 名（active ceo） | 個人メール可（`grandfather_emails`） |
| AIA / メールなしエージェント | SSO メールなし |
| 2人目以降の常勤人間 | 会社ドメイン必須（先に `email_domains`） |
| 税理士・業務委託 | 期限付きゲスト（`guest_expires_at`）。常勤にしない |
| 同一メールの複数テナント常勤 | **禁止**（ゲストは可） |

- ドメイン未設定（空 / 省略）のデモテナントは名簿照合のみ。常勤人間メールが2件以上なら error
- Community SSO の token email は、mapped operator の `email` と一致必須（operator に email がある場合）
- PassKey ログインは `operator_id` バインド済みのためドメイン検査しない
- `mcp_service` と期限付きゲストはドメイン・横断検査の免除
- 新規 standing operator の email はドメインまたは grandfather に一致必須
- LLM / MCP は `login_policy` を変更しない

---

## 5. 生成物

| 種別 | パス |
|------|------|
| Agent 要約 | `docs/reports/agent-summaries/` |
| 経営ダッシュボード | `docs/reports/dashboard/` |
| Work Order | `docs/reports/routing-queue/` |
| 会社イベント | `orgos events new` → `docs/company/events/` |

---

## 7. マルチツール互換（Cursor 以外）

Agent 定義（`steward/core/agents/*.md`）は **Markdown 正本** — Claude · ChatGPT · Cline · Aider · Continue 等でも利用可。

| 手段 | コマンド / パス |
|------|----------------|
| Agent パック出力 | `orgos operator export --agent finance` / `--all` |
| AGENTS.md 同期 | `orgos operator sync-policy --emit agents-md` |
| MCP（Today · Ask · Witness） | `orgos mcp start` · snippet: `steward/platform/agent/exports/mcp/` |
| Shell 実行 | `ORGOS_SHELL_PROFILE=aider` · `orgos agent dispatch run --runtime shell` |
| OpenAI 互換 API | `OPENAI_API_KEY` / `ORGOS_LLM_API_URL` · `orgos chat ask` |

Work Order プロンプトは **Path + Cursor @ 参照** を併記（ツール中立）。

Skill `runtime`: `cli`（LLM 不要）· `agent`（LLM + 定義添付 · 旧 `cursor-only` と同義）。

---

## 8. 関連

- [openorgos-engineering-constitution.md](openorgos-engineering-constitution.md) — 憲章索引
- [engineering/00-このフォルダについて.md](engineering/00-このフォルダについて.md) — 分割正本 00–09
- [tool-neutral-development.md](tool-neutral-development.md) — **今後の開発ガイド（Cursor 非依存）**
- [testing-modules.md](testing-modules.md) — Vitest 3 軸 taxonomy · 段階実行
- [steward_os_principles.md](steward_os_principles.md)
- [agent_skill_architecture.md](agent_skill_architecture.md)
- [secretary_steward_boundary.md](secretary_steward_boundary.md)
