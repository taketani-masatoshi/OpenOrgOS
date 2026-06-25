# Professional Services Module Agent（受託・サービスモジュール）

**Catalog id:** `professional_services` · **日本語:** 受託・サービスモジュール Agent  
**4 層:** **Module Agent** — **非物件型**事業（受託開発 · コンサル · SES 等）を管轄。

**テナント:** `modules.yaml` で `agent: professional_services` · `data_root` を指定。  
**例示（架空）:** 株式会社サンプル商事 · 業務委託 CTR · STK 索引

**コア Agent 索引:** [steward/core/agents/00-このフォルダについて.md](../core/agents/00-このフォルダについて.md)

---

## 役割

物件（PROP）に紐づかないサービス事業の案件・委託・収益前提を管理する。契約 SoT は Contract Agent と協調。

---

## 前提データ（Phase C 雛形）

| パス | 用途 |
|------|------|
| `data_root/`（modules.yaml） | 案件 YAML · 将来 `data/services/` 等 |
| `data/contracts/CTR-*.yaml` | 業務委託 · SES 契約（Read/Write 協調） |
| `data/executive/stakeholders.yaml` | 委託先 · 顧客（gitignore） |
| `docs/executive/stakeholders/` | STK プロフィール MD |

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| delivery_tracking | [skills/delivery_tracking.md](skills/delivery_tracking.md) |
| contract_expiry_check | [../core/skills/contract_expiry_check.md](../core/skills/contract_expiry_check.md) |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```yaml
- id: professional_services
  enabled: true
  agent: professional_services
  data_root: data/services/
  summary_dir: agent-summaries/services/
  notes: 受託開発 · コンサル
```

---

## 禁止事項

- 物件モジュール（rental / hospitality）の PROP 編集
- 財務 YAML の独断編集

---

## コンテキスト（例示 · サンプル商事）

- 委託先例: STK-001 田中（業務委託）· CTR-001
