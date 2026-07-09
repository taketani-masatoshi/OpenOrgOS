# テナント Executive · Protocol スキャフォールド標準

**版:** 1.0 · **日付:** 2026-07-10  
**正本:** 本書 · **実装:** `src/lib/tenant-scaffold.ts` · `src/lib/tenant-init.ts`

全テナントで Secretary · protocol 連携が **同じ初期形状** になるよう標準化する。1 テナントだけの特例を作らない。

---

## 必須スキャフォールド（init · scaffold-data · setup-wizard）

| パス | example | 実体 | 用途 |
|------|---------|------|------|
| `data/executive/calendar.yaml` | ○ | gitignore | 社長カレンダー |
| `data/executive/tasks.yaml` | ○ | gitignore | タスク |
| `data/executive/one-on-ones.yaml` | ○ | gitignore | 1-on-1 |
| `data/executive/external-contacts.yaml` | ○ | gitignore | 社外連絡先（**第一照合源**） |
| `data/executive/stakeholders.yaml` | ○ | gitignore | 利害関係者 |
| `data/protocol/peers.yaml` | ○ | L1 追跡 | peer 台帳 · Secretary gate 入口 |
| `data/classification-registry.yaml` | テンプレ全文 | 追跡 | `RES-EXEC-*` · `RES-PROTOCOL-PEERS` |

生成 CLI:

```bash
orgos tenant init <id>          # _template コピー + skeleton
orgos tenant scaffold-data      # 欠損のみ補完 + classification マージ
orgos tenant align-classification --all   # 全テナント一括マージ
```

---

## Secretary peer 横断（全テナント共通）

- **入口:** 自社 `data/protocol/peers.yaml` の `org_uri: steward://tenant/{id}`
- **読取:** 相手 `company.yaml` · `external-contacts.yaml`（L1 のみ）
- **禁止:** `peer_id` を tenant id としての fallback · 相手 tenant 総参照 · L2 ファイル

検証: `orgos validate` → integrity `validatePeerContactRegistry` + `validateProtocolState`

---

## テナント横断の期待動作

| 状況 | 標準動作 |
|------|----------|
| peers.yaml 未作成 | validate warning · scaffold-data で `peers: []` seed |
| peer に org_uri なし | warning · Secretary peer 横断不可（自社 external-contacts のみ） |
| org_uri → 存在しない tenant | **error** |
| org_uri → tenant 存在 · L1 なし | warning |
| `steward://peer/PEER-*` | Wire 外部ノード — Secretary 照合対象外 |

---

## 関連

- [folder_access_policy.md §2.8.1](folder_access_policy.md)
- [secretary-contact-registry.md](secretary-contact-registry.md)
- `tenants/_template/data/` — 新規 tenant の正本雛形
