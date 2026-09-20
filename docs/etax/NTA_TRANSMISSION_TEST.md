# NTA KSK2 transmission test procedure

**Status:** not executed · required for D4 / T-O2–T-O3  
**Checklist:** [CERTIFICATION_CHECKLIST.md](CERTIFICATION_CHECKLIST.md) · [ACCEPTANCE.md](ACCEPTANCE.md)

1. Confirm KSK2 listing https://www.e-tax.nta.go.jp/shiyo/ksk2/ksk2_shiyo.htm
2. Apply via 電子メールによるお問い合わせ (software vendor transmission test).
3. Use **test** credentials only. Never production.
4. On Windows with NTA modules + `tools/etax-host` (`ORGOS_ETAX_HOST_MODE=com`):
   ```bash
   orgos etax host status --json
   orgos etax host bind --i-understand-windows
   ```
5. Run RHO0010 `--env test`: build→validate→approve→sign→ready→submit→receipt.
6. Record T-O2 evidence (gitignore):
   ```bash
   orgos etax transmission-test record --from ./rho0010-test-submit.json
   ```
   Schema: [transmission-evidence.example.md](transmission-evidence.example.md)
7. Record NTA completion L1 JSON, then **human-edit** `production-gate.yaml`:
   - `nta_transmission_test.completed: true`
   - `evidence_path: data/etax/transmission-test/nta-completion.json`
   - related `requirements.*` flags that are proven — never invent
8. Promote + release + product copy (only after D4–D6 path is real):
   ```bash
   orgos etax procedure promote-rho0010
   # propose/approve etax.production_enable …
   orgos etax production release --approval-id APR-…
   orgos etax product-copy sync
   orgos etax acceptance report --json   # ok:true
   ETAX_D18_ACCEPTANCE=1 npx vitest run tests/etax-d1-d8-acceptance.test.ts
   ```

Until certified: `e-Tax production submission: NOT CERTIFIED / DISABLED`.

**Do not** set `nta_transmission_test.completed: true` without evidence. **Do not** claim e-Tax対応完了 until D1–D8.
