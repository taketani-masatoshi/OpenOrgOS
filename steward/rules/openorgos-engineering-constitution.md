# OpenOrgOS Engineering Constitution

**版:** 1.0 · **日付:** 2026-07-11 · **状態:** Active  
**適用:** 本リポジトリおよび OpenOrgOS エコシステムの全言語 · 全コントリビュータ（人間 · AI）

---

## 本書の位置づけ（OrgOS 内）

| レイヤー | 正本 | 役割 |
|---------|------|------|
| **運用ポリシー** | [operator-policy.md](operator-policy.md) | AI 読取境界 · L0–L3 · RBAC |
| **OS 思想** | [steward_os_principles.md](steward_os_principles.md) | 4 層 · Data 原則 · 人間の最終判断 |
| **開発手順** | [tool-neutral-development.md](tool-neutral-development.md) | CLI 正本 · Skill runtime · チェックリスト |
| **エンジニアリング憲章** | [engineering/](engineering/00-このフォルダについて.md) | アーキテクチャ · コーディング · テスト · ドメイン |
| **本書** | 本書 | **索引** — 分割正本への入口 |

矛盾がある場合: **運用ポリシー（L2/L3 等）> 憲章 > 個人の好み**

---

## 分割正本（`steward/rules/engineering/`）

| ファイル | 内容 | Cursor |
|---------|------|--------|
| [00-engineering-constitution.md](engineering/00-engineering-constitution.md) | Purpose · §10 AI Rules · §11 DoD | alwaysApply |
| [01-architecture.md](engineering/01-architecture.md) | SSOT · Catalog/Roster · Layer · CLI | `src/**`, `schemas/**` |
| [02-typescript.md](engineering/02-typescript.md) | §4 Coding · TypeScript | `**/*.{ts,tsx}` |
| [03-python.md](engineering/03-python.md) | Python | `**/*.py` |
| [04-testing.md](engineering/04-testing.md) | §8 Testing · Vitest 3 軸 | `**/*.{test,spec}.*` |
| [05-git.md](engineering/05-git.md) | Git · PR 安全 | 手動 |
| [06-documentation.md](engineering/06-documentation.md) | README · ADR | `docs/**`, `steward/**` |
| [07-security.md](engineering/07-security.md) | L0–L3 参照（operator-policy 正本） | `src/**`, `data/**` |
| [08-event-sourcing.md](engineering/08-event-sourcing.md) | Event First · Immutable · Deterministic | `src/lib/protocol/**` |
| [09-openorgos-domain.md](engineering/09-openorgos-domain.md) | 4 層 · Wire · Catalog/Roster | `steward/**`, `schemas/**` |

ミラー生成: `orgos operator sync-policy --emit engineering`（または `--emit all`）

---

## OrgOS 参照実装マッピング

| 憲章 | OrgOS での具体例 |
|------|-----------------|
| §1.1 SSOT | テナント `data/**/*.yaml` 正本 · `docs/` は派生 |
| §1.2 Catalog / Roster | `schemas/agent-catalog.ts` vs `schemas/agent-roster.ts` |
| §1.3 Event First | `company-events.yaml` · Wire delivery ledger |
| §7 CLI Standard Path | `orgos validate` → `src/commands/` → `src/lib/` → YAML/FS |
| §8 Testing | Domain · Vitest · [testing-modules.md](testing-modules.md) |

---

## 関連

- [engineering/00-このフォルダについて.md](engineering/00-このフォルダについて.md) — 分割正本索引
- [docs/adr/0001-adopt-engineering-constitution.md](../../docs/adr/0001-adopt-engineering-constitution.md) — 採用 ADR
- [docs/adr/0002-engineering-rules-split.md](../../docs/adr/0002-engineering-rules-split.md) — 分割 ADR
- [docs/adr/0003-constitution-code-compliance-roadmap.md](../../docs/adr/0003-constitution-code-compliance-roadmap.md) — コード準拠ロードマップ
- [docs/adr/](../../docs/adr/README.md) — ADR 一覧
