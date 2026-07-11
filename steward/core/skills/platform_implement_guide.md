# Skill: platform_implement_guide（プラットフォーム実装ガイド）

> **Deprecated alias** — 正本は決定論 CLI。本 Skill は互換転送のみ。

**Path:** `steward/core/skills/platform_implement_guide.md`  
**Runtime:** `cli` · **Agent:** `platform_guide`（advisor · developer_explicit のみ）

## 推奨 CLI（正本）

```bash
orgos platform extension-check
orgos platform registry-verify
orgos platform guide --topic all          # legacy checklist
orgos platform scaffold agent <id>        # dry-run（--write は Engineering）
```

## 互換転送

```bash
npm run orgos -- skills run platform-implement-guide
npm run orgos -- skills run platform-implement-guide --topic eval
```

## 説明正本

- `steward/rules/tool-neutral-development.md`
- `docs/org-os/openorgos-core-philosophy.md`
- `steward/modules/module_contract.md`
- `docs/org-os/wire-gateway-requirements.md`

## 禁止

- 実装の自動実行（advisor は consult のみ）
- L2/L3 の出力
