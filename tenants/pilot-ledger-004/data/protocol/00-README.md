# data/protocol/

Wire · peer 台帳。Secretary の社外連絡先照合 gate（§2.8.1）もここを入口とする。

| ファイル | Git | 用途 |
|---------|-----|------|
| `peers.yaml.example` | 追跡 | テンプレート |
| `peers.yaml` | 追跡（L1） | peer 正本 · `org_uri: steward://tenant/{id}` で Secretary 横断可 |

初期化: `orgos tenant init` または `orgos tenant scaffold-data`

正本: [secretary-contact-registry.md](../../../../steward/rules/secretary-contact-registry.md) · [folder_access_policy.md §2.8.1](../../../../steward/rules/folder_access_policy.md)
