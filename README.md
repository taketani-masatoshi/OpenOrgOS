# Steward OS

不動産・旅館・サービス事業向け **経営支援 OS フレームワーク**。会社ごとの正データ・書類は **テナント**（`tenants/`）に分離する。

**物理構成正本:** [steward/rules/repository_layout.md](steward/rules/repository_layout.md)

---

## このリポジトリの構成

```
Steward/
├── steward/          Agent · Skill · Rules（汎用フレームワーク）
├── src/              CLI · 検証
├── schemas/          データスキーマ
├── docs/             フレームワーク文書（spec · agent_architecture）
├── tenants/          会社別インスタンス
│   └── mal/          株式会社MAL（既定テナント）
│       ├── tenant.yaml
│       ├── data/     正データ YAML
│       ├── docs/     人向け MD · CSV · PDF 索引
│       └── rules/    会社固有コンテキスト
├── scratch/          試行（gitignore）
└── assets/           PDF フォント等
```

---

## テナント（会社）データ

| テナント | 法人 | パス |
|---------|------|------|
| **mal**（既定） | 株式会社MAL | [`tenants/mal/`](tenants/mal/) |

```bash
export STEWARD_TENANT=mal
npm run steward -- --tenant mal validate
```

論理パス `data/` · `docs/` は **アクティブテナント内**を指す（CLI · Agent 共通）。

---

## セットアップ

```bash
npm install
npm run validate
```

## よく使うコマンド

```bash
npm run validate
npm run steward -- status
npm run steward -- sync all
npm run steward -- dashboard
npm run steward -- io status
npm run steward -- classification check
```

詳細: [docs/spec-v0.2.md](docs/spec-v0.2.md) · テナント索引: [tenants/00-README.md](tenants/00-README.md)

---

## 人はどこを見る？

**→ アクティブテナントの [`tenants/{id}/docs/`](tenants/mal/docs/00-このフォルダについて.md)**

MAL の場合: 決算 · 契約 · 物件運用 · レポートはすべて `tenants/mal/docs/` 配下。

---

## Cursor / Agent

**8 Agent:** [steward/agents/00-このフォルダについて.md](steward/agents/00-このフォルダについて.md)

会社固有情報: 各テナントの `rules/company_context.md`（例: [tenants/mal/rules/company_context.md](tenants/mal/rules/company_context.md)）
