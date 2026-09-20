# Official NTA KSK2 spec copies

Downloaded CAB/XSD files live in `vendor/` (gitignored). Record hashes in `manifest.json`.

```bash
orgos etax spec status
orgos etax spec fetch
orgos etax spec unpack
```

Signature interface catalog: `signature-catalog.yaml`.
Transport interface catalog: `transport-catalog.yaml` (Windows COM `nta.CLCCommunication.Send`).
OrgOS does not invent a CLI around either module.

Do not mix https://www.e-tax.nta.go.jp/shiyo/shiyo3.htm (current e-Tax) with
https://www.e-tax.nta.go.jp/shiyo/ksk2/ksk2_shiyo3.htm (KSK2).
