# Tenant runtime artifacts

テナント workspace に **テスト・pilot・日次運用** で生成され、git 正本に含めないパス。

正本: [`.gitignore`](../../.gitignore) · 分類: テナント `data/classification-registry.yaml`

## カテゴリ

| カテゴリ | パス例 | 復元 |
|----------|--------|------|
| Protocol キュー | `data/protocol/wire-pending.yaml` · `relay-state.yaml` · `federation-gossip-store.yaml` | `git checkout -- tenants/<id>/data/protocol/` |
| Org 監査 bridge | `data/org/audit-bridge-state.yaml` | 再生成または checkout |
| Executive 実行時 | `data/executive/calendar.yaml` · `mail-*-queue.yaml` | checkout または Skill/CLI 再実行 |
| Records vault (L2) | `tenants/*/records/**`（template 例除く） | **コミット禁止** — Privacy Mode / `@file` のみ |
| Engineering seed コピー | `docs/engineering/**`（`_template` 除く） | `orgos tenant init` |
| イベント成果物 | `docs/company/artifacts/**` | イベント再生成 |
| Vitest | `tests/.fixture-restore.lock` | `rm -rf tests/.fixture-restore.lock` |

## 運用

```bash
# 汚染確認（追跡ファイルのみ）
git status tenants/

# protocol 正本シードへ戻す
git checkout -- tenants/mal/data/protocol/

# fixture lock が残ったら
rm -rf tests/.fixture-restore.lock
orgos doctor   # fixture_restore_lock チェック
```

## 関連

- [folder_access_policy.md](../../steward/rules/folder_access_policy.md) — L0–L3
- [testing-modules.md](../../steward/rules/testing-modules.md) §7 — Vitest fixture 制約
