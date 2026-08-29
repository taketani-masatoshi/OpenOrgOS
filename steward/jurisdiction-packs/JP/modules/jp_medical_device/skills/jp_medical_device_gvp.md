# Skill: jp_medical_device_gvp

## 目的

GVP マニュアル · 収集 · 評価 · 報告 · 文書管理手順及び様式のドラフト生成。

## CLI

```bash
npm run orgos -- operations medical-device gvp catalog
npm run orgos -- operations medical-device gvp draft --doc GVP-001 --write
npm run orgos -- operations medical-device ae-add --seriousness serious --summary "..."
npm run orgos -- operations medical-device gvp escalate --id AE-... --propose-approval --proposed-by "薬事担当"
npm run orgos -- operations medical-device inquiry set-response --id INQ-... --path docs/medical-device/applications/reply.md
```

## 参照

- JIRA GVP 手順書 · 東京都 GVP チェック · GVP 省令

## 禁止

PMDA への自動届出 — 人間が実行
