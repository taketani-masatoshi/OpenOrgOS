# Skill: pmo_show（1 案件）

## 目的

指定 `PRJ-*` の status · RAG · マイルストーン · リンク id を出す。契約・許認可の中身は見ない。

## 入力

- `--id PRJ-…`
- `data/projects/{id}.yaml`

## 出力

- 案件フィールドと `links.*` の id のみ

## 使用 Agent

Project Management Agent

## CLI

```bash
npm run orgos -- pmo show PRJ-BANCHO-HQ
npm run orgos -- skills run pmo-show --id PRJ-BANCHO-HQ
```

## runtime

`cli` — LLM 不要。

## 禁止

- 金額 · 個人名
- リンク先 YAML の複製
