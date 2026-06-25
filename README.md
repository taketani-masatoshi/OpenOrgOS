# Steward OS

**経営支援 OS フレームワーク**。業務モジュール・ISO 標準はフレームワーク側に初期定義し、会社データは **テナント**（`tenants/`）で接続・分離する。

**物理構成正本:** [steward/rules/repository_layout.md](steward/rules/repository_layout.md)

---

## 組織 OS 4 層 + テナント

```
steward/
├── core/                   常時 — agents/ · skills/ · routing/ · orchestrators/
├── modules/{id}/           業務モジュール — agent.md · seed/ · skills/
├── jurisdiction-packs/{code}/  法域 — 規程 · 税 seed · 法域 modules/
├── jurisdictions/          索引のみ — registry.yaml · packs.lock.yaml
├── platform/               Phase 2/3 — webhook · cloud agent
├── standards/iso/          ISO 標準
└── rules/                  原則 · ポリシー

src/ · schemas/ · docs/     CLI · 検証 · 仕様

テナント（接続）
├── tenant.yaml             jurisdiction · locale
├── modules.yaml            業務 ON/OFF · パスバインド
├── standards.yaml / regulations.yaml
├── data/ · docs/ · rules/
```

| 層 | 例 |
|----|-----|
| モジュール seed | `steward/modules/rental/seed/` |
| ISO 標準文 | `steward/standards/iso/ISO-9001/` |
| 規程テンプレ | `steward/jurisdiction-packs/JP/regulations/`（法域 pack） |
| テナント ISO 記録 | `tenants/mal/docs/compliance/iso/` |
| テナント規程施行文 | `tenants/mal/docs/company/regulations/` |

```bash
npm run steward -- modules list
```

---

## テナント（会社）データ

| テナント | 法人 | パス | 用途 |
|---------|------|------|------|
| **mal**（既定） | 株式会社MAL | [`tenants/mal/`](tenants/mal/) | 本番運用参照 |
| **acme** | ACME Corp | [`tenants/acme/`](tenants/acme/) | **第3参照**（tenant init · validate） |
| **demo** | デモ株式会社 | [`tenants/demo/`](tenants/demo/) | **スケルトン参照**（validate 必須） |

```bash
# 新規テナント（スケルトン）
npm run steward -- tenant init acme --name "ACME Corp" --from rental

export STEWARD_TENANT=mal
npm run steward -- --tenant mal validate
npm run steward -- --tenant demo validate   # CI ゲート
npm run steward -- --tenant acme validate   # CI ゲート（第3テナント）
npm run check                               # validate · demo · acme · modules · classification
```

論理パス `data/` · `docs/` は **アクティブテナント内**を指す。

---

## セットアップ

```bash
npm install
npm run validate
```

## よく使うコマンド

```bash
npm run validate
npm run steward -- --tenant demo validate   # 骨格参照テナント
npm run steward -- tenant init acme --name "株式会社ACME" --from rental
npm run steward -- regulations seed
npm run steward -- modules list
npm run steward -- ops p0
npm run steward -- skills list
npm run steward -- skills run daily
npm run steward -- status
npm run steward -- sync all
npm run steward -- dashboard
npm run steward -- classification check
npm run steward -- invoice generate --module rental --property PROP-001 --from 2026-02 --to 2026-02 --fy FY2026 --dry-run
npm run steward -- standards list
npm run steward -- modules check rental
npm run steward -- modules check --all
npm run steward -- map list
npm run check
npm run daily      # check + pipeline run daily
npm run weekly     # check + pipeline run weekly
```

詳細: [docs/spec.md](docs/spec.md)（**仕様正本**） · [docs/framework-assessment.md](docs/framework-assessment.md) · [docs/framework-backlog.md](docs/framework-backlog.md) · 旧版: [docs/spec/history/](docs/spec/history/)

---

## Cursor / Agent

**コア Agent + 業務モジュール:** [steward/core/agents/00-このフォルダについて.md](steward/core/agents/00-このフォルダについて.md)

会社固有情報: `tenants/{id}/rules/company_context.md`
