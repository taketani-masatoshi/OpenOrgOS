# Agent Advisor 運用ガイド

**版:** 1.0 · **日付:** 2026-07-11  
**正本:** 本書 · **Catalog 正本:** `steward/core/agents/registry.yaml`

`class: advisor` · `activation: developer_explicit` の Agent（現状: `platform_guide`）の **テナント運用手順**。

---

## 1. 役割と制約

| 項目 | advisor（`platform_guide`） |
|------|----------------------------|
| dispatch | `consult` のみ — `implement` 不可 |
| auto-route | 不可（一般キーワード routing 対象外） |
| auto-pulse | 不可 |
| Primary Folders | **なし**（read-only 参照のみ） |
| 実装 | **engineering** へ委譲 |
| 設計判断 | **cto** |
| Wire 本番ゲート | **security** |

---

## 2. 有効化（テナント roster）

正本: `tenants/{id}/data/operator/agents.yaml`

```yaml
version: 1
profiles:
  operational:
    - executive_steward
    - secretary
    # ... 通常業務 Agent
  developer:
    - platform_guide   # ← developer_explicit のみここで有効化
disabled: []
```

```bash
orgos agent roster enable --agent platform_guide --profile developer
orgos agent roster show
orgos agent roster validate
```

**operational profile では inactive のまま** — Today · routing · pulse には出ない。

---

## 3. consult の起動経路

| 経路 | 用途 |
|------|------|
| `orgos route match --text "..." --profile developer` | 明示 developer profile で route 候補確認 |
| routing `platform-guide-consult`（`profiles: [developer]`） | 低優先度の設計レビュー intent |
| `orgos platform guide` / `extension-check` / `registry-verify` | **決定論 CLI**（LLM 不要 · 推奨） |
| Agent pack 直接指定 | `orgos operator export --agent platform_guide` |

日常の拡張チェックは **CLI 優先**:

```bash
orgos platform extension-check
orgos platform registry-verify
orgos platform scaffold agent <id>          # 既定 dry-run
```

---

## 4. Agent 変更パイプライン（PR 完了ゲート）

```bash
npm run agent:catalog:sync
npm run agent:capability:sync
npm run agent:docs:sync
npm run agent:roster:fixtures:sync   # tests/fixtures/tenant-rosters overlay
npm run agent:pipeline:check
npm run test:contract
npm run orgos -- validate
orgos operator export --all
```

---

## 5. 関連

- [agent-authority-model.md](agent-authority-model.md) — `reports_to` と chain-policy の分離
- [tool-neutral-development.md](tool-neutral-development.md) — Skill runtime · CLI 優先
- `steward/core/agents/platform_guide_agent.md` — Advisor 定義
