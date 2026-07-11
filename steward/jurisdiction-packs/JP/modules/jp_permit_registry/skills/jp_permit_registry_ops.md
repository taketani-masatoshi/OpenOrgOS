# Skill: jp_permit_registry（許認可・届出台帳）

**Module:** `jp_permit_registry` · **Agent:** Compliance（proxy）

## 目的

JP 許認可種別カタログに基づき、保有許可の期限 · 前提不足 · 義務超過を gap 分析する。

## 入力

- `seed/permit-types-catalog.yaml`（またはテナントコピー）
- `seed/obligations-catalog.yaml`
- `data/permit-registry/permit-registry.yaml`
- `data/permit-registry/obligation-instances.yaml`

## 出力

- gap 一覧（CLI / MD）
- `docs/reports/agent-summaries/compliance/permit-gap-{YYYY-MM-DD}.md`（将来）

## CLI

```bash
npm run orgos -- operations permit validate
npm run orgos -- operations permit gap
npm run orgos -- operations permit obligations --type pt-ryokan-hotel
```

## 禁止

- 許可証内容の invent
- 行政への自動提出
