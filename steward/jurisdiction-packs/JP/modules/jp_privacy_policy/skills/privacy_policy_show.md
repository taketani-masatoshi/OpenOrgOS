# Skill: jp_privacy_policy_show（方針サマリ）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_privacy_policy/skills/privacy_policy_show.md`
**Runtime:** `cli` · **Module:** `jp_privacy_policy` · **Agent:** Compliance

## 目的

外部向けプライバシーポリシーの現況を返す — 版 · draft/published · 公表日と URL · レビュー周期と次回期限 · 問合せ窓口 · 必須記載事項の充足数。

## 入力

- `data/declarations/jp-privacy-policy/policy-meta.yaml`（未展開時は module seed）
- `docs/compliance/privacy/privacy-policy.md`（公表文の有無）

## CLI

```bash
npm run orgos -- skills run jp-privacy-policy-show
npm run orgos -- operations privacy-policy show --json
```

## 禁止

個人データの実レコードを要約に転記しない。方針本文と社内規程 REG-010 の矛盾は Compliance へエスカレーション。
