# ルート `data/` — プロトコル開発ランタイム

**注意:** テナント正データではありません。会社 YAML は `tenants/{id}/data/` を使います。

| サブディレクトリ | 用途 |
|-----------------|------|
| `hub-a/` · `hub-b/` | Witness Hub ローカル開発（`orgos hub serve --data-dir ./data/hub-a`） |
| `proposal3-pki/` | Proposal 3 mTLS 開発用 CA · 鍵（gitignore） |
| `.orgos/` | CLI ローカルキャッシュ（gitignore） |

本番・Docker では `deploy/witness-hub/data/` 等を参照。詳細: [docs/org-os/witness-hub-operations.md](../docs/org-os/witness-hub-operations.md)
