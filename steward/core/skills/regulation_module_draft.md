# Skill: regulation_module_draft

**Path:** `steward/core/skills/regulation_module_draft.md`  
**Runtime:** `cli`  
**Agent:** Compliance

## 目的

モジュールの規程分類（`regulation-plan`）に従い、テナント下に **未施行の草案 MD** を決定論で置く。  
LLM は後からそのパスを埋める。施行・`regulations.yaml` enabled は人間のみ。

## CLI

```bash
npm run orgos -- skills run regulation-module-draft --id <moduleId>
npm run orgos -- modules regulation-plan <moduleId> --file-wo
```

## 出力

- `docs/company/regulations/drafts/{moduleId}-{kind}-草案.md`
- Work Order 起票時は `context.path` が主草案を指す

## 禁止

- REG-025 / REG-026 等 `do_not_mutate` 施行文の上書き
- 草案 scaffold だけで `escalate complete` しない
