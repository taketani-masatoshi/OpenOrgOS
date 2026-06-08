# 株式会社サンプル商事 — Steward コンテキスト（転用デモ）

**テナント id:** `sample-co` · **用途:** フレームワーク転用性の第2テナント実証

## 事業

- みなとビル501 賃貸（PROP-001）のみ
- 宿泊 · VC 等は **無効**

## 有効化

```bash
STEWARD_TENANT=sample-co npm run steward -- modules list
STEWARD_TENANT=sample-co npm run validate
```

## 規程

`regulations.yaml` で REG-001/004/010 のみ有効。施行文は `docs/company/regulations/` にテンプレから展開。
