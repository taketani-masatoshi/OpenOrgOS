# Skill: regulation_module_scaffold

**Path:** `steward/core/skills/regulation_module_scaffold.md`  
**Runtime:** `cli`  
**Agent:** Compliance  
**旧 id:** `regulation_module_draft`（alias · scaffold と同義）

## 目的

モジュールの規程分類（`regulation-plan`）に従い、テナント下に **未施行の草案 MD の置き場** を決定論で作る（scaffold）。  
条文の肉付けは LLM（`agent implement`）または人間。施行・`regulations.yaml` enabled は人間のみ。

## CLI

```bash
npm run orgos -- skills run regulation-module-scaffold --id <moduleId>
npm run orgos -- modules regulation-plan <moduleId> --file-wo
```

## 出力

- `docs/company/regulations/drafts/{moduleId}-{kind}-草案.md`
- 複数 kind があるとき `…-INDEX-草案.md`（WO `context.path`）

## 禁止

- REG-025 / REG-026 等 `do_not_mutate` 施行文の上書き
- scaffold だけで `escalate complete` しない
