# NTA KSK2 transmission test procedure

**Status:** not executed · operator evidence required for D4 / T-O2–T-O3  
**Checklist:** [CERTIFICATION_CHECKLIST.md](CERTIFICATION_CHECKLIST.md)

1. Confirm KSK2 listing https://www.e-tax.nta.go.jp/shiyo/ksk2/ksk2_shiyo.htm
2. Apply via 電子メールによるお問い合わせ (software vendor transmission test).
3. Use **test** credentials only. Never production.
4. On Windows with NTA modules + `tools/etax-host` (`ORGOS_ETAX_HOST_MODE=com`):
   - Set signature/transport catalog `hostBound: true` only after `orgos etax host status` reports bound.
   - Run RHO0010 `--env test`: build→validate→approve→sign→ready→submit→receipt.
   - Confirm 受付番号 is **not** `MOCK-NOT-NTA-*`.
5. Record request id, dates, procedure codes, and evidence under gitignored
   `data/etax/transmission-test/` (or `tenants/*/data/etax/transmission-test/`) and set
   `production-gate.yaml` `nta_transmission_test.evidence_path` + `completed: true` **only when the file exists**.
6. After successful T-O3, promote RHO0010 in `supported-procedures.yaml` to
   `SUPPORTED` + `productionEligible: true` (human edit — never invent success).
7. Then propose org approval `subject_type: etax.production_enable` and run
   `orgos etax production release --approval-id APR-...`.

```bash
orgos etax host status --json
orgos etax transmission-test status
orgos etax production review --json
```

Until certified, CLI/UI must show: `e-Tax production submission: NOT CERTIFIED / DISABLED`.

**Do not** set `nta_transmission_test.completed: true` without evidence. **Do not** claim e-Tax対応完了 until D1–D8.
