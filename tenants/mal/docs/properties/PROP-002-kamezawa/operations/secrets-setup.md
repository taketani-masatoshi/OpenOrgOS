# 亀沢 secrets セットアップ（Phase A）

**正本 example:** `tenants/mal/data/operations/kamezawa-secrets.yaml.example`  
**実体（gitignore · L2）:** `tenants/mal/data/operations/kamezawa-secrets.yaml`

## 手順

```bash
cd tenants/mal/data/operations
cp kamezawa-secrets.yaml.example kamezawa-secrets.yaml
# エディタで REPLACE_ME を実値に置換（スマートロック・Wi-Fi・緊急電話）
STEWARD_TENANT=mal npm run orgos -- validate
STEWARD_TENANT=mal npm run orgos -- hospitality blockers
```

## ルール

- Git にコミットしない（`.gitignore` の `*-secrets.yaml`）
- チャット・Agent 要約に鍵・Wi-Fi パスワードを出さない
- ゲスト案内文面の生成は `orgos hospitality guest-message render`（送信は人間 / OTA）

## ブロッカー

`kamezawa-secrets.yaml` が無い場合、`hospitality blockers` が P0 を報告する。
