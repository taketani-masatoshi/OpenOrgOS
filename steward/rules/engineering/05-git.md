---
description: OpenOrgOS Git workflow — commits, branches, PR safety
alwaysApply: false
---

# Git Workflow

**Index:** [openorgos-engineering-constitution.md](../openorgos-engineering-constitution.md)

---

## Commits

- Create commits **only when explicitly requested**
- Never commit secrets (`.env`, credentials)
- Use complete-sentence commit messages focused on **why**

## Safety

- Never `git push --force` to main/master without explicit approval
- Never skip hooks (`--no-verify`) unless explicitly requested
- Avoid `git commit --amend` unless HEAD is unpushed and created in the same session
- Never update git config from automation

## Pull requests

- Use `gh pr create` with Summary + Test plan
- Push branch with `-u` before creating PR
- Review **all commits** on the branch, not just the latest

## Data changes

After YAML/data edits in tenant workspace:

```bash
orgos validate
```

