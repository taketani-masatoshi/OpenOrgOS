# Skill: iso_control_review（ISO × REG 統制レビュー）

## 目的

有効 ISO の統制成熟度 · ギャップ · 証拠パスをレビューし、Compliance 要約を生成する。

## 入力

- `data/compliance/controls.yaml`
- `steward/standards/iso/*/control-map.yaml`
- `steward/standards/control-framework/`
- `docs/compliance/iso/**`

## 出力

- 統制ギャップサマリ MD（L1 以下）
- `docs/reports/agent-summaries/compliance/controls-{YYYY-MM-DD}.md`

## 使用 Agent

Compliance Agent

## CLI

```bash
npm run orgos -- controls gap
npm run orgos -- controls status
npm run orgos -- skills run iso-control-review
npm run orgos -- compliance gap
```

## 禁止

- L2 口座 · 個人住所の出力
- secrets 値の転記
