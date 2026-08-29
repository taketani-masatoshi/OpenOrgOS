# ADR 0014 — pdf_esign は国家 eID 正経路（商用 ESP 禁止）

- **Status:** Accepted
- **Date:** 2026-07-14
- **Deciders:** OpenOrgOS maintainers
- **Supersedes (partial):** ADR 0013 の系統 B における「商用 ESP Adapter」記述

## Context

系統 B（対外 PDF 署名）で CloudSign 等の商用 ESP を検討したが、保証主体が民間になり OpenOrgOS の思想と合わない。  
真正性の枠は **国家が発行する ID と国家が公開する署名インフラ** に置く。OrgOS は検証結果の記録者であり、保証者ではない。

将来、OrgOS 自身が証明書を発行する CA になる余地はあるが、**既定・推奨は常に国家 eID**。CA 化は国家ルートを置き換えない別レイヤとする。

## Decision

1. **`pdf_esign` = National eID first**。第一実装はエストニア **DigiDoc / SiVa / digidoc4j**（`.asice`）。
2. **商用 ESP Adapter は実装・維持しない**（既存 mock は削除）。
3. **法人の設立国 ≠ 署名に使う国家スタック** を許容する（クロスボーダー選択）。
4. フォールバックは `manual`（紙等）のみ。
5. 将来の OrgOS CA は任意・明示 opt-in。国家 eID を default のままにする。
6. Wire 禁止は ADR 0013 維持。

## Cross-border（国を跨ぐ実装方法）

会社の登記地（例: JP）と、署名に使う eID（例: EE DigiDoc / e-Residency）は **分離**する。

```text
tenant.jurisdiction     = 会社法・税・規程の正本（例: JP）
pdf_esign.national_eid  = 署名スタック（例: EE digidoc）  ← テナント設定で選択
```

| レイヤ | 正本 | 例 |
|--------|------|-----|
| 法域パック | `steward/jurisdiction-packs/{code}/` | JP 規程 · EE メモ |
| カタログ（利用可能な国家スタック） | コア schema / registry | `EE:digidoc`, 将来 `JP:jpki` |
| テナント選択 | `data/pdf-esign/national-eid.yaml` | `active_stack: EE/digidoc` |
| ケース記録 | `ES-*`.`national_eid_stack` | 監査で「どの国の枠で署名したか」が残る |

**推奨パターン（日本法人 + エストニア DigiDoc）:**

1. 会社の `jurisdiction` は JP のまま（規程・税は JP pack）。  
2. `national-eid.yaml` で `active_stack: EE/digidoc`。  
3. 署名者は e-Residency（または EE digi-ID）カード + DigiDoc4。  
4. 検証は自前 SiVa（国 OSS）。相手も DigiDoc を使えることが契約前提。  
5. 日本 JPKI が必要になったら **別 Adapter `jp_jpki`** を同じカタログに追加（ESP で代替しない）。

**相手との組み合わせ:**

| 自社スタック | 相手 | やり方 |
|--------------|------|--------|
| EE DigiDoc | EE DigiDoc | `.asice` 双方署名 · SiVa |
| EE DigiDoc | 国家 eID なし | `manual` 紙、または相手に DigiDoc/e-Residency 取得を求める |
| EE DigiDoc | 将来 JP JPKI | 別ケースまたは両スタック併記は後続 ADR（混在コンテナは要設計） |

**アンチパターン:** クロスボーダーだからといって商用 ESP で「国の差を埋める」こと。差は **国家スタックの選択と契約前提** で埋める。

## Future — OrgOS が CA になる場合

- 国家 eID が使えない・社内専用の用途に限定しうる。  
- 既定パスは変えず、`provider: orgos_ca` のような **明示 Provider** にする。  
- 「CloudSign と同じ保証」を OrgOS が担うなら、監査・失効・TSP 運用が別プロダクト規模になる（本 ADR のスコープ外）。

## 署名の一手は端末側（仕様であり未実装ではない）

カード・リーダー・PIN は署名者の端末に留まる。OrgOS は骨組み（unsigned ASiC-E）を渡し、戻ってきた `.asice` の digest と SiVa の判定だけを記録する。**PIN や秘密鍵をサーバやブラウザに送らせない**ため、この一手を自動化しない。これは残タスクではなく設計上の境界。

Console（`/?esign=1`）の一連:

1. 案件作成（PDF アップロード · `chat:approve`）
2. 骨組み生成（digidoc4j サイドカー）
3. **DigiDoc4 + カードで署名**（端末側）
4. 署名済み `.asice` を添付 — 構造検査 + 元 PDF digest 照合
5. SiVa 検証 — **live の `TOTAL-PASSED` のみ** `completed`。mock は決して完了させない

BFF: `GET /chat/v1/esign/ready` · `/cases`、`POST /chat/v1/esign/create` · `/prepare` · `/attach` · `/verify`。台帳（`data/pdf-esign/cases.yaml`）に載るのは path・digest・indication・署名数のみ。

## Consequences

### Positive

- 「誰が保証するか」= 国家 eID エコシステム（記録は OrgOS）。  
- JP 本店でも EE DigiDoc を正式ルートにできる。  
- 法域ごとの国家 Adapter をカタログ追加で拡張できる。

### Negative / risks

- 相手の eID 前提が契約条件になる。  
- SiVa / digidoc 運用が必要。  
- OrgOS CA は後回し（期待を混同しない）。

## Related

- Plan: [pdf-esign-digidoc-plan.md](../org-os/pdf-esign-digidoc-plan.md)  
- Requirements: [pdf-esign-requirements.md](../org-os/pdf-esign-requirements.md)  
- Channel split: [0013-document-attestation-vs-pdf-esign.md](0013-document-attestation-vs-pdf-esign.md)
