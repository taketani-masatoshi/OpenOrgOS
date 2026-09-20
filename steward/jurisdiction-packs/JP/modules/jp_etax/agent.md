# JP e-Tax Integration Module Agent

**Catalog id:** `jp_etax` · **Agent proxy:** tax  
**Spec:** [docs/etax/IMPLEMENTATION_PLAN.md](../../../../../docs/etax/IMPLEMENTATION_PLAN.md) · ADR 0078  
**Host contract:** [docs/etax/HOST_CONTRACT.md](../../../../../docs/etax/HOST_CONTRACT.md)

## 役割

国税庁 e-Tax（**KSK2 対応版**）への **変換 · 検証 · 署名アダプタ · 送受信アダプタ · 受付取込**。

税額計算・申告書ドラフトは行わない。上流（`jp_tax_corporate` / `jp_tax_consumption` / handoff）が作った **確定 ReturnPackage** だけを扱う。

## 状態

**EXPERIMENTAL / NOT FOR PRODUCTION ETAX SUBMISSION**

`e-Tax production submission: NOT CERTIFIED / DISABLED`

実装100（mock 端到端）≠ 認証100（COM bind · NTA 送信試験 · production gate）≠ e-Tax対応完了。

## Primary Folders

- `data/etax/**`（packages / submissions / audit / generated）
- `steward/jurisdiction-packs/JP/modules/jp_etax/spec/**`（manifest · mappings · catalogs）

## CLI（到達可能な操作）

```bash
orgos etax spec status
orgos etax spec fetch
orgos etax build --from package.json
orgos etax validate <submission-id> --xml <path>
orgos etax approve-propose <submission-id>
orgos etax approve <submission-id> --approval-id APR-...
orgos etax sign <submission-id> --env mock --xml <path>
orgos etax ready <submission-id> --env mock
orgos etax submit <submission-id> --env mock --xml <path>
orgos etax receipt <submission-id> --env mock
orgos etax production review
```

第一手続: **RHO0010**（`EXPERIMENTAL` · `productionEligible: false`）。

## 禁止

- 税額の計算・推定
- 未対応手続の XML 推測 · 手続コードの発明
- 秘密鍵 / PIN の保存・ログ · CLI フラグ
- production 送信（国税庁送信試験と production gate 完了まで）
- 既存 `not-for-etax` XML ドラフトを公式申告データとして扱うこと
- LLM Skill からの sign / submit（Skill は status / validate のみ）
