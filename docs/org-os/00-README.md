# docs/org-os — 組織 OS · 法域拡張

Steward OS の **法域（jurisdiction）· 表示言語（locale）· 法人形態** に関する設計文書。

## 読む順

| 順 | 文書 | 内容 |
|----|------|------|
| 1 | [tjs-11-target-jurisdictions.md](tjs-11-target-jurisdictions.md) | **製品ゴール** — TJS-11 分母 · pack_ready DoD · 三軸評価 |
| 2 | [jurisdiction-pack-contract.md](jurisdiction-pack-contract.md) | テナント bind · pack 構成 |
| 3 | [jurisdiction-matrix.md](jurisdiction-matrix.md) | Corporate Core 写像 · 調査表 |
| 4 | [jurisdiction-oss-governance.md](jurisdiction-oss-governance.md) | OSS 分離 · CODEOWNERS |

## 実装正本

| パス | 役割 |
|------|------|
| `steward/jurisdictions/` | 索引 · countries.yaml · packs.lock |
| `steward/jurisdiction-packs/` | bundled pack 実体 |
| `steward/locale/registry.yaml` | 表示言語（法域と独立） |
| `src/lib/jurisdiction.ts` · `locale.ts` | 解決ロジック |

## 評価

完成度は [framework-assessment.md](../framework-assessment.md) §11 · バックログは [framework-backlog.md](../framework-backlog.md) Phase ORG-J8。
