# Acceptance — e-Tax対応完了（RHO0010）

機械的受け入れ。**現 tip では certified=false**。対応完了宣言は次がすべて緑のときだけ。

```bash
# CI / 自動
ORGOS_TEST_DISPOSABLE_ROOT=$PWD npx vitest run \
  tests/etax-*.test.ts tests/catalog/jp-etax.test.ts

# オペレータ（Windows · evidence 後）
orgos etax production review --json   # certified=true
# supported-procedures.yaml: RHO0010 SUPPORTED + productionEligible: true
# CHANGELOG: 「e-Tax対応完了（RHO0010）」— 全税目完了とは書かない
# ToS: e-Tax提出除外文言の更新は別 PR（対応完了と同時）
```

Gate tip を evidence 無しで true にしない。`ORGOS_ETAX_PRODUCTION=1` は無効。
