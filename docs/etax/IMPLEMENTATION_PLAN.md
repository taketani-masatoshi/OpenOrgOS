# e-Tax Integration — Implementation Plan

**Status:** Mechanism score M1–M13 · Certification lane (D1–D8) not met · production **NOT CERTIFIED / DISABLED** · **NOT e-Tax対応完了**  
**Date:** 2026-09-21 · **ADR:** [0078](../adr/0078-etax-integration.md)  
**Operator checklist:** [CERTIFICATION_CHECKLIST.md](CERTIFICATION_CHECKLIST.md)

This document is the scorecard for `jp_etax`. It must not claim e-Tax certification until D1–D8 are all true.

---

## e-Tax対応完了（D1–D8）

次をすべて満たしたときだけ、製品・文書で **e-Tax対応完了** と書いてよい。スコープは第一手続 **RHO0010** に限定する（全税目対応ではない）。

| # | 条件 | 意味 |
|---|------|------|
| D1 | 公式パスが到達可能 | Windows 上で `official` 署名＋送受信ホストが `hostBound: true`。`--env test` が mock に落ちない |
| D2 | 公式 XML が本番品質 | RHO0010 生成 XML が e-tax19 XSD Layer1 pass。e-tax08 依存が data 化済み、または「依存なし」が明示 |
| D3 | 受付が公式 | e-tax18 受付フィールドマップで 受付番号をパース。`MOCK-NOT-NTA-` を本番経路で使わない |
| D4 | NTA 送信試験 | 国税庁ソフトウェアベンダー送信試験を実施し、gitignore 下の evidence が存在 |
| D5 | production-gate 全 true | `production-gate.yaml` の 7 requirements + `production_submission_enabled` + evidence_path。人間レビュー記録あり |
| D6 | 手続が SUPPORTED | `supported-procedures.yaml` の RHO0010 が `SUPPORTED` + `productionEligible: true` |
| D7 | 製品文言一致 | readiness ≥ `activation_ready`（本番提出 SKU）、CLI/UI バナーが CERTIFIED/ENABLED、ToS・商業宣言を同期 |
| D8 | 安全不変条件 | PIN/秘密鍵非保存、env 単独で本番不可、税計算モジュールに submit なし、shiyo3 非混在 |

**明示的に含めないもの:** 他手続、macOS 単独本番提出、税額の正しさ（`RECEIVED_BY_ETAX` ≠ 税務正しさ）。

---

## 100-point definition (two lanes)

Lane 1 is **機構100点** (M1–M13). It is what `orgos efiling score` reports. Lane 1 green is **not** e-Tax対応完了.

Lane 2 remains D1–D8 in [ACCEPTANCE.md](./ACCEPTANCE.md). Windows COM, NTA transmission evidence, and human production release stay outside the mechanism score.

### Mechanism score (M1–M13)

| ID | Pass when |
|----|-----------|
| M1 | e-Tax and eLTAX mock lifecycles reach receipt without a hand-placed status or hash |
| M2 | HOA110 body fields come from mapping YAML and pass official XSD. Empty `<HOA110 .../>` is rejected. Missing XSD is `SPEC_BLOCKED`, not a pass |
| M3 | Unregistered forms and fields fail closed |
| M4 | CI installs xmllint. Missing CAB asserts `SPEC_BLOCKED` instead of `skipIf` |
| M5 | `evaluateTaxAdjustment` feeds a ReturnPackage with `corporate_tax_xml_draft` provenance |
| M6 | In-flight recovery: found / not_found / unknown |
| M7 | Slot + idempotency key + package hash, stale write rejected |
| M8 | Amended/corrected require the original receipt and do not overwrite it |
| M9 | Evidence hashes, 10-year retention, legal hold cannot be released |
| M10 | Secrets stay out of child env, logs, and unpinned executables |
| M11 | Production stays fail-closed. `ORGOS_ETAX_PRODUCTION=1` does not enable it |
| M12 | e-Tax and eLTAX stores, specs, transports, and signatures do not cross. eLTAX procedures stay UNSUPPORTED |
| M13 | readiness, ToS, commercial declaration, and CHANGELOG say **not certified / production DISABLED** |

`evaluateImplementationScore().ok === true` only when every row passes. A missing workbook or XSD leaves M2 `SPEC_BLOCKED` and the score below 13. Do not write e-Tax対応完了 in CHANGELOG from this score.

### Certification-100 / 対応完了 (D1–D8)

- Windows COM host bound (`hostBound: true` after health)
- NTA transmission test evidence on disk
- `production-gate.yaml` all true after human review + `etax production release`
- Only then is “e-Tax対応完了（RHO0010）” allowed in CHANGELOG / commercial copy

Scaffolding Phases 1–8 alone is **not** 対応完了.

---

## Scorecard

| Lane | Focus | Status |
|------|--------|--------|
| A | Contract repair (state machine, xmlHash provenance, slot identity, approval rollback, disk SHA gate) | Done |
| B | First procedure RHO0010 (e-tax19 envelope + mapping; e-tax10 retrieved) | Done (EXPERIMENTAL) |
| C | Mock E2E without hand-placed status | Done |
| D | Host contract docs; `hostBound: false` on Darwin | Done |
| E | Honest docs / readiness `experimental` | Done |
| Cert C0 | D1–D8 + CERTIFICATION_CHECKLIST | Done |
| Cert C1 | Windows etax-host bind (T-A1 / T-O1) | Code done · T-O1 operator |
| Cert C2 | Mapping / inter-form / receipt map (T-A3–T-A5) | Done |
| Cert C3 | `tests/etax-certification.test.ts` | Done |
| Cert C4 | NTA transmission + RHO0010 SUPPORTED | Operator (path ready) |
| Cert C5 | production release + gate + banners | Code done · gate tip false |
| Cert C6 | CHANGELOG 対応完了宣言 | Blocked on certified |

---

## Architecture

```text
jp_tax_* / handoff          jp_etax                         NTA
calculation, drafts   →     spec-registry                   e-Tax
not-for-etax XML            mapper (RHO0010)
Approved ReturnPackage  →   xml-generator (XSD)      →      KSK2 XML
                            validator L1/L2/L3
                            org approval (hash-bound)
                            SignatureProvider adapter →     official signature module
                            EtaxTransport adapter     →     send/receive module
                            receipt-adapter           ←     受付発行 XML
                            submission-state + audit
```

Filing **slot** identity = `taxpayer|procedure|year|revision` (no content hash).  
`contentHash` binds approval, signature, and ready only.

---

## KSK2 baseline

| Fact | Value |
|------|--------|
| Family | KSK2 |
| Listing | https://www.e-tax.nta.go.jp/shiyo/ksk2/ksk2_shiyo3.htm |
| Do not use | https://www.e-tax.nta.go.jp/shiyo/shiyo3.htm (current soft) |
| Manifest | `steward/jurisdiction-packs/JP/modules/jp_etax/spec/manifest.json` |
| Required CABs for `ksk2SpecRegistered` | e-tax01, 04, 05, 07, 08, 10, 19 (on-disk SHA == manifest) |

First OpenOrgOS procedure: **RHO0010** (普通法人の確定申告・青色) — `EXPERIMENTAL`, `productionEligible: false`.

---

## SPEC_BLOCKED (must stay honest until certified)

- Full e-tax10 field workbook → complete mapping for every form beyond RHO0010 IT subset
- Official signature / transport **hostBound** remains false in repo tip until Windows health succeeds
- NTA transmission test evidence (operator; never invented)
- `production_submission_enabled` (only via `etax production release --approval-id`)

See also [HOST_CONTRACT.md](HOST_CONTRACT.md) · [CERTIFICATION_CHECKLIST.md](CERTIFICATION_CHECKLIST.md).

---

## Certification tests

### Automated (T-A*) — `tests/etax-certification.test.ts`

| ID | Test | Pass |
|----|------|------|
| T-A1 | `hostBound` contract | official adapter uses host path only when `hostBound`; else SPEC_BLOCKED. Real COM skipped off win32 |
| T-A2 | mock isolation | mock provider forbidden for `--env test` / `production` |
| T-A3 | RHO0010 XSD | generator output Layer1 pass (no hand-written XML) |
| T-A4 | Layer2 | inter-form HOA110 pass |
| T-A5 | receipt map | e-tax18 YAML extracts receiptNumber from structural fixture |
| T-A6 | slot / hash | concurrent slot reject; hash mutation invalidates approval |
| T-A7 | production gate | evidence missing → `certified === false`; temp fixture can be true |
| T-A8 | `ORGOS_ETAX_PRODUCTION=1` | ignored when gate incomplete |
| T-A9 | tax-calc boundary | `jp_tax_*` has no submit API |
| T-A10 | readiness / banner | CERTIFIED banner only when certified |

CI (Darwin/Linux): T-A2–T-A10 + mock E2E. T-A1 COM is `skipIf(!win32 \|\| !hostBound)`.

### Operator (T-O*) — [CERTIFICATION_CHECKLIST.md](CERTIFICATION_CHECKLIST.md)

T-O1 host bind · T-O2 test submit · T-O3 NTA evidence · T-O4 credentials · T-O5 human release · T-O6 banner.

---

## Related ADR / policy

| Document | Role |
|----------|------|
| ADR 0078 | Independent `jp_etax` · 対応完了 = production-gate certified + RHO0010 SUPPORTED |
| ADR 0052 / 0051 | Tax-calc modules stay not-for-etax |
| ADR 0038 | Hash-bound human approval (`etax.return_package` · `etax.production_enable`) |
| ADR 0014 | No private key / PIN in OrgOS |

Tax-calc files must not gain submit methods.
