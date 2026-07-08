# Skill: jp_medical_device_qms

## 目的

医療機器 QMS 文書（品質マニュアル · 規程 · SOP · 様式）のカタログ参照と company SoT 埋め込みドラフト生成。

## CLI

```bash
npm run orgos -- operations medical-device qms catalog --tier 1
npm run orgos -- operations medical-device qms draft --doc QMS-MAN-001 --write
npm run orgos -- operations medical-device qms draft --all --write
```

## 参照

- 東京都 QMS チェック · ISO 13485 · QMS 省令
- テンプレ: `steward/jurisdiction-packs/JP/modules/jp_medical_device/seed/templates/qms/`

## Agent

Medical Device Regulatory Agent
