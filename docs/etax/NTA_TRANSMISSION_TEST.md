# NTA KSK2 transmission test procedure

**Status:** not executed · Phase 7

1. Confirm KSK2 listing https://www.e-tax.nta.go.jp/shiyo/ksk2/ksk2_shiyo.htm
2. Apply via 電子メールによるお問い合わせ (software vendor transmission test).
3. Use **test** credentials only. Never production.
4. Record request id, dates, procedure codes, and evidence under a gitignored path referenced from `production-gate.yaml`.
5. Do not set `nta_transmission_test.completed: true` without that evidence file.

Until then CLI/UI must show: `e-Tax production submission: NOT CERTIFIED / DISABLED`.
