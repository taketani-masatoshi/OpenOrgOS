# Tenant agent roster fixtures

## 正本と派生物

| 層 | パス | 役割 |
|----|------|------|
| **正本** | `tenants/{id}/data/operator/agents.yaml` | git 追跡 · テナントごとの active roster |
| **テスト overlay** | `tests/fixtures/tenant-rosters/{id}/agents.yaml` | Vitest が `demo/data` 復元後に上書き |

`tenants/*/agents.yaml` が正本です。fixture は **テスト安定化用のコピー** であり、二重の正本ではありません。

## 変更フロー

```bash
# 1. roster 編集・検証
orgos agent roster validate --sync-modules

# 2. fixture 同期（正本 → tests/fixtures）
npm run agent:roster:fixtures:sync

# 3. drift gate
npm run agent:pipeline:check
```

`agent:roster:fixtures:check` は正本と fixture のテナント一覧一致のみ検証します（内容バイト一致は `fixtures:sync` 運用で担保）。

## Vitest との関係

[`tests/setup-restore-protocol.ts`](../setup-restore-protocol.ts):

1. `git archive` で `tenants/demo/data` 等を復元
2. `overlayTenantRosterFixtures()` で全管理テナントの `agents.yaml` を fixture から復元

`demo/data` 復元で `operator/agents.yaml` が消えるため、overlay が必要です。正本は git にあり、fixture はそのミラーです。
