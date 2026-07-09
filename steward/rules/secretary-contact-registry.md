# Secretary 連絡先レジストリ運用

**版:** 1.0 · **日付:** 2026-07-10  
**正本:** 本書 · **Agent:** [secretary_agent.md](../core/agents/secretary_agent.md)

秘書エージェントが **人物名・会社名・部署** を指定されたとき、推測せず正本 DB を照合し、人間が開示した情報は正本を更新するためのルール。

---

## 原則

1. **推測禁止** — 正本にないメールアドレス・部署・役職を捏造しない
2. **照合優先** — 下書き・返信案の前に必ず `orgos secretary contacts resolve` 相当の照合を行う
3. **更新義務** — 人間が新情報を開示したら `register` で正本を更新し `validate` する
4. **人格分離** — 同一氏名でも法人代表 / 個人 / 経理窓口は別レコードとして管理

---

## 照合対象 DB（優先順）

| 順 | スコープ | 正本パス |
|----|---------|----------|
| 1 | 自社 | `data/company.yaml`（代表・役員） |
| 2 | 自社 | `data/executive/external-contacts.yaml` |
| 3 | 自社 | `data/executive/stakeholders.yaml`（gitignore） |
| 4 | 自社 | `data/executive/one-on-ones.yaml` · `data/hr/employees.yaml` |
| 5 | 他社（契約先） | 上記 stakeholders / external-contacts |
| 6 | 他社（peer テナント） | `data/protocol/peers.yaml` → 相手 `tenants/{id}/data/company.yaml` · `external-contacts.yaml` |

L2（口座・個人携帯等）は本レジストリに書かない。`bank_account_id` / `stakeholder_id` リンクのみ。

---

## Secretary と Operator の境界

| 主体 | テナント切替 | 他社データ |
|------|-------------|-----------|
| **Secretary** | 自社 `ORGOS_TENANT` 固定 | `peers.yaml` 経由の L1 **のみ**（`company.yaml` · `external-contacts.yaml`） |
| **Operator（汎用 LLM）** | 指示に応じて切替可 | [folder_access_policy.md](folder_access_policy.md) · ユーザー指示範囲 |

Secretary 業務で `ORGOS_TENANT=mal` のように **相手テナントへ切替えて照合するのは禁止**。Southwood 秘書が MAL 代表を確認する正しい経路:

```bash
ORGOS_TENANT=southwood npm run orgos -- secretary contacts resolve --org MAL
# → 自社 external-contacts（優先）+ peer 経由 L1
```

Policy 正本: [folder_access_policy.md §2.8.1](folder_access_policy.md) · [tenant-executive-scaffold.md](tenant-executive-scaffold.md)

---

## CLI

```bash
# 照合（0 件 → exit 1 · 複数 → exit 2）
npm run orgos -- secretary contacts resolve --name "竹谷" --org "Southwood"
npm run orgos -- secretary contacts resolve --department "経理"

# 人間開示後の登録
npm run orgos -- secretary contacts register \
  --name "竹谷昌敏" --org "Southwood" --role "代表取締役" \
  --email "m.taketani@southwood.co.jp" --stakeholder-id STK-003

npm run orgos -- validate
```

---

## Secretary の応答パターン

| 状況 | 応答 |
|------|------|
| 正本 0 件 | 「正本に未登録のため把握していません」— 推測しない |
| 正本 複数件 | 用途（代表 / 経理 / 個人契約）・部署を人間に確認 |
| 正本 1 件 | `email` · `EXT-*` · `STK-*` を明示して下書き |
| 人間が新アドレス開示 | `register` → 更新内容を報告 → 必要なら下書き宛先を修正 |

---

## 下書き連携

`secretary correspondence draft` は:

- `--contact-ref EXT-...` 指定時、正本 `email` を `--to` に反映
- `--to` が正本と不一致なら **警告**
- 正本未登録の `--to` でも下書きは可能だが、送信前に `register` 完了を促す

---

## 関連

- [secretary_steward_boundary.md](secretary_steward_boundary.md)
- [external_correspondence.md](../core/skills/external_correspondence.md)
- [data-classification](../.cursor/rules/data-classification.mdc) — L2/L3 出力禁止

**Mirror:** `.cursor/rules/` には単独正本を置かない — `orgos operator sync-policy --emit all`
