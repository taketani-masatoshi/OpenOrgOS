# Skill: jp_privacy_policy_status（公表状態・必須記載事項）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_privacy_policy/skills/privacy_policy_status.md`
**Runtime:** `cli` · **Module:** `jp_privacy_policy` · **Agent:** Compliance

## 目的

公表可否の判断材料を返す。`policy-meta.yaml` の版・公表状態と、公表文の見出しから **必須記載事項**（基本方針 · 取得する情報 · 利用目的 · 第三者提供 · 問合せ窓口）の充足を照合する。

## 入力

- `data/declarations/jp-privacy-policy/policy-meta.yaml`
- `docs/compliance/privacy/privacy-policy.md`（未展開時は seed の雛形）

## CLI

```bash
npm run orgos -- skills run jp-privacy-policy-status
npm run orgos -- operations privacy-policy policy-status --json
npm run orgos -- operations privacy-policy validate
```

## 使用 Agent

Compliance Agent · Secretary Agent（公表手続 Read）

## 禁止

必須記載事項の欠落を残したまま `status: published` に更新しない。公表日・URL は実際の掲載後に記録する。
