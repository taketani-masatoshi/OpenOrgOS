# Acceptance — e-Tax対応完了（RHO0010）· D1–D8

**到達定義:** 実オペレータ到達（選択肢1）。tip 上で下表がすべて真のときだけ **e-Tax対応完了（RHO0010）** と書いてよい。  
evidence 捏造禁止。`production-gate.yaml` tip を偽 true にしない。

**判定 CLI:** `orgos etax acceptance report --json`  
**B層テスト:** `ETAX_D18_ACCEPTANCE=1 npx vitest run tests/etax-d1-d8-acceptance.test.ts`

---

## 機械判定表

| ID | 達成基準 | 判定関数 | tip 観測 / 証跡 |
|----|----------|----------|-----------------|
| D1 | signature+transport `hostBound: true`。Windows で etax-host `signatureBound && transportBound`。`--env test` で mock 拒否 | `evaluateD1()` | catalog YAML · host health · T-O1 ログ |
| D2 | RHO0010 生成 XML のみで Layer1 XSD pass。HOA110 inter-form pass。`report.ok` | `evaluateD2()` | mapping · e-tax19 · inter-form-rules |
| D3 | e-tax18 receipt-mapping。official が `MOCK-NOT-NTA-` 拒否。T-O2 JSON の受付番号が実番 | `evaluateD3()` | `data/etax/transmission-test/*test-submit*.json` |
| D4 | gate `nta_transmission_test.completed` + 実在 `evidence_path`（L1 参照ID・日付） | `evaluateD4()` | gitignore evidence · gate yaml |
| D5 | `evaluateProductionEnablement().certified === true` | `evaluateD5()` | production-gate + release 監査 |
| D6 | RHO0010 `SUPPORTED` + `productionEligible: true` | `evaluateD6()` | supported-procedures.yaml |
| D7 | readiness ≥ `activation_ready`。CERTIFIED バナー。ToS/商業が RHO0010 有効化を反映 | `evaluateD7()` | readiness.yaml · ToS · commercial-declaration |
| D8 | mock 隔離 · env 単独不可 · jp_tax_* に submit なし · shiyo3 非混在 · PIN CLI 無し | `evaluateD8()` | 静的 + 契約 |

**除外:** 他手続、税額正しさ、macOS 単独本番。

---

## テスト二層

### A層（常時 CI）

```bash
ORGOS_TEST_DISPOSABLE_ROOT=$PWD npx vitest run \
  tests/etax-certification.test.ts \
  tests/etax-lifecycle-e2e.test.ts \
  tests/etax-phase*.test.ts \
  tests/catalog/jp-etax.test.ts
```

未達中も緑。契約と「tip は正直に未達」を守る。

### B層（受け入れ · 明示実行）

```bash
ETAX_D18_ACCEPTANCE=1 ORGOS_TEST_DISPOSABLE_ROOT=$PWD \
  npx vitest run tests/etax-d1-d8-acceptance.test.ts
```

tip が D1–D8 全達成のときだけ全緑。Windows+NTA 証跡前は意図的に fail。

---

## オペレータ後の宣言

```bash
orgos etax acceptance report --json   # ok: true
orgos etax production review --json   # certified=true
```

その後のみ CHANGELOG に「e-Tax対応完了（RHO0010）」。全税目完了とは書かない。
