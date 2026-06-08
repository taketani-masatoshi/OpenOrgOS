# Agent ルーティング · 実装委譲（Phase 1）

静的レジストリ + classification アクセスチェック + handoff / work order キュー。

| 層 | 正本 | 実装 |
|---|---|---|
| Capability check | `data/classification-registry.yaml` | `src/lib/classification.ts` |
| Route registry | `steward/routing/registry.yaml` | `src/lib/routing.ts` |
| Skill dispatch | `steward/skills/registry.yaml` | `src/lib/skill-registry.ts` |
| Work orders | `docs/reports/routing-queue/` | `src/lib/escalate.ts` |

## task_type

| task_type | 用途 | Orchestrator | ID 例 |
|-----------|------|--------------|-------|
| `consult` | 照会 · 是非 · 手順 | `secretary_escalation.md` | `HO-*` |
| `implement` | コード · docs · schema 実装 | `delegate_implementation.md` | `IMP-*` |

## mode

| mode | 意味 |
|------|------|
| `suggest` | カード / MD 表示のみ（デフォルト） |
| `auto` | 紐づく CLI Skill を `skills run` 実行 |
| `implement` | Work Order 生成済み · Agent プロンプト MD で Cursor 並列起動（Phase 1） |

## CLI — route

```bash
npm run steward -- route list
npm run steward -- route match --text "契約期限"
npm run steward -- route access --agent secretary --path data/executive/calendar.yaml
npm run steward -- route handoff --text "契約期限" --from steward
npm run steward -- route dispatch --id HO-... --mode auto
npm run steward -- route dispatch --id IMP-... --mode implement
```

## CLI — escalate（実装委譲）

```bash
npm run steward -- escalate plan --text "..." [--dry-run]
npm run steward -- escalate run --text "..." --from executive_steward
npm run steward -- escalate run --id IMP-...     # プロンプト再生成
npm run steward -- escalate status [--pending|--blocked]
npm run steward -- escalate complete --id IMP-... --notes "..."
```

**出力:** `docs/reports/routing-queue/IMP-*.{yaml,md}` · `prompts/IMP-*_{agent}.md`

## 境界

- `data/executive/**` · `docs/executive/**` → **secretary**（management routes）
- KPI / dashboard → **executive_steward**（`boundary: executive_summaries`）
- `module_agent: true` → テナント `modules.yaml` で有効なモジュール Agent のみ

## Phase 2（未実装）

- Cursor Task API / Cloud Agent 並列起動
- webhook · 外部キュー DB
- Agent 結果の自動マージ
