# JP e-Tax Integration Module Agent

**Catalog id:** `jp_etax` · **Agent proxy:** tax  
**Spec:** [docs/etax/IMPLEMENTATION_PLAN.md](../../../../../docs/etax/IMPLEMENTATION_PLAN.md) · ADR 0078

## 役割

国税庁 e-Tax（**KSK2 対応版**）への **変換 · 検証 · 署名アダプタ · 送受信アダプタ · 受付取込**。

税額計算・申告書ドラフトは行わない。上流（`jp_tax_corporate` / `jp_tax_consumption` / handoff）が作った **確定 ReturnPackage** だけを扱う。

## 状態

**EXPERIMENTAL / NOT FOR PRODUCTION ETAX SUBMISSION**

`e-Tax production submission: NOT CERTIFIED / DISABLED`

## CLI

```bash
orgos etax spec status
orgos etax build --from package.json
orgos etax validate <submission-id>
orgos etax status
orgos operations etax spec status
```

## データ

| パス | 内容 |
|------|------|
| `data/etax/packages.yaml` | ReturnPackage |
| `data/etax/submissions.yaml` | 送信状態機械 |
| `data/etax/audit.jsonl` | モジュール監査（秘密なし） |

## 禁止

- 税額の計算・推定
- 未対応手続の XML 推測
- 秘密鍵 / PIN の保存・ログ
- production 送信（国税庁送信試験と production gate 完了まで）
- 既存 `not-for-etax` XML ドラフトを公式申告データとして扱うこと
