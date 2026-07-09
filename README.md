# OrgOS（参照実装）

**Organizational OS — 組織 OS 参照実装**。業務モジュール・ISO 標準はフレームワーク側（`steward/`）に初期定義し、会社データは **テナント**（`tenants/`）で接続・分離する。

**製品名:** OrgOS · **npm:** `orgos-reference` · **CLI:** `orgos`（旧 `steward` は非推奨 · [docs/org-os/cli-migration.md](docs/org-os/cli-migration.md)）

**物理構成正本:** [steward/rules/repository_layout.md](steward/rules/repository_layout.md)

---

## 組織 OS 4 層 + テナント

```
steward/                    実装詳細（ディレクトリ名は据え置き）
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
npm run orgos -- modules list
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
npm run orgos -- tenant init acme --name "ACME Corp" --from rental

export ORGOS_TENANT=mal
npm run orgos -- --tenant mal validate
npm run orgos -- --tenant demo validate   # CI ゲート
npm run orgos -- --tenant acme validate   # CI ゲート（第3テナント）
npm run check                               # validate · demo · acme · modules · classification
```

論理パス `data/` · `docs/` は **アクティブテナント内**を指す。

---

## セットアップ（いちばん早い試し方）

**Docker（推奨 · 手元で UI を試す）— 本番禁止**

```bash
# GHCR（main / タグ後）— localhost のみバインド
docker pull ghcr.io/taketani-masatoshi/orgos-demo:main
docker run --rm -p 127.0.0.1:9470:9470 ghcr.io/taketani-masatoshi/orgos-demo:main

# またはリポジトリから build
docker compose -f deploy/demo/docker-compose.yaml up --build
bash deploy/demo/acceptance.sh   # 任意スモーク
# Chat http://127.0.0.1:9470/ · Wire http://127.0.0.1:9470/wire/
```

公開・検証: [deploy/demo/PUBLISH.md](deploy/demo/PUBLISH.md) · `npm run demo:docker:verify-ghcr`

詳細: [docs/quickstart.md](docs/quickstart.md) · [docs/org-os/demo-docker.md](docs/org-os/demo-docker.md) · [deploy/demo/README.md](deploy/demo/README.md)

**開発リポジトリ（CLI · テスト · カスタム）**

```bash
npm install
npm run orgos -- doctor
npm run validate
```

**自社 workspace（Core インストール後）:** `orgos init …` — [docs/quickstart.md](docs/quickstart.md) §1–2  
**本番常駐:** [docs/operator-production.md](docs/operator-production.md)（Demo イメージは使わない）

## よく使うコマンド

```bash
npm run validate
npm run orgos -- --tenant demo validate   # 骨格参照テナント
npm run orgos -- tenant init acme --name "株式会社ACME" --from rental
npm run orgos -- regulations seed
npm run orgos -- modules list
npm run orgos -- ops p0
npm run orgos -- skills list
npm run orgos -- skills run daily
npm run orgos -- status
npm run orgos -- status --orgos          # OrgOS 完成度
npm run orgos -- sync all
npm run orgos -- dashboard
npm run orgos -- classification check
npm run orgos -- invoice generate --module rental --property PROP-001 --from 2026-02 --to 2026-02 --fy FY2026 --dry-run
npm run orgos -- standards list
npm run orgos -- modules check rental
npm run orgos -- modules check --all
npm run orgos -- map list
npm run check
npm run daily      # check + pipeline run daily
npm run weekly     # check + pipeline run weekly
```

詳細: [docs/spec.md](docs/spec.md)（**仕様正本**） · [docs/org-os/orgos-vocabulary.md](docs/org-os/orgos-vocabulary.md) · [docs/framework-assessment.md](docs/framework-assessment.md) · [docs/framework-backlog.md](docs/framework-backlog.md)

---

## Cursor / Agent

**コア Agent + 業務モジュール:** [steward/core/agents/00-このフォルダについて.md](steward/core/agents/00-このフォルダについて.md)

会社固有情報: `tenants/{id}/rules/company_context.md`
