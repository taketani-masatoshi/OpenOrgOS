# Steward OS

**経営支援 OS フレームワーク**。業務モジュール・ISO 標準はフレームワーク側に初期定義し、会社データは **テナント**（`tenants/`）で接続・分離する。

**物理構成正本:** [steward/rules/repository_layout.md](steward/rules/repository_layout.md)

---

## 3 層構成

```
フレームワーク（汎用 · MAL 非依存）
├── steward/modules/{id}/     Agent · skills · seed/（雛形データ）
├── steward/standards/iso/    ISO 標準方針・記録様式
├── steward/standards/regulations/  社内規程テンプレ · catalog.yaml
├── steward/agents/           6 コア Agent
├── src/ · schemas/ · docs/

テナント（接続・バインド）
├── tenants/{id}/modules.yaml   モジュール ON/OFF · パス参照
├── tenants/{id}/standards.yaml ISO ON/OFF
├── tenants/{id}/regulations.yaml  社内規程 ON/OFF
├── tenants/{id}/data/          正データ
├── tenants/{id}/docs/          人向け書類（ISO ギャップ・監査等はここ）
└── tenants/{id}/rules/         会社コンテキスト
```

| 層 | 例 |
|----|-----|
| モジュール seed | `steward/modules/rental/seed/` |
| ISO 標準文 | `steward/standards/iso/ISO-9001/` |
| 規程テンプレ | `steward/standards/regulations/catalog.yaml` |
| テナント ISO 記録 | `tenants/mal/docs/compliance/iso/` |
| テナント規程施行文 | `tenants/mal/docs/company/regulations/` |

```bash
npm run steward -- modules list
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
npm run steward -- modules list
npm run steward -- status
npm run steward -- sync all
npm run steward -- dashboard
npm run steward -- classification check
```

詳細: [docs/spec-v0.2.md](docs/spec-v0.2.md) · [tenants/00-README.md](tenants/00-README.md) · [steward/modules/](steward/modules/00-このフォルダについて.md) · [steward/standards/iso/](steward/standards/iso/00-このフォルダについて.md)

---

## Cursor / Agent

**コア Agent + 業務モジュール:** [steward/agents/00-このフォルダについて.md](steward/agents/00-このフォルダについて.md)

会社固有情報: `tenants/{id}/rules/company_context.md`
