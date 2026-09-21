# PDF e-Sign Module Agent（国民 eID 署名）

**モジュール:** `pdf_esign` · **Proxy Agent:** Contract
**用途:** 署名依頼の作成と検証。署名そのものは本人が自分のカードで行う。

**権限:** propose まで。署名と完了判定は人間の apply · 正本 [ADR 0079](../../../docs/adr/0079-module-ai-permission-declaration.md)
**関連:** [ADR 0014](../../../docs/adr/0014-pdf-esign-national-eid.md) · [ADR 0080](../../../docs/adr/0080-catalog-id-materialism.md)

## 面

| 層 | 実装 |
|----|------|
| Schema | `schemas/pdf-esign.ts` |
| Domain | `src/lib/pdf-esign/` |
| Command | `src/commands/operations-esign.ts` |
| CLI 登録 | `steward/modules/pdf_esign/cli/register.ts` |

外部依存は SiVa と digidoc4j sidecar。接続設定は gitignore された 0600 のストアに置き、トークンは出力しない。

## CLI

```bash
npm run orgos -- operations esign ready
npm run orgos -- operations esign list
npm run orgos -- operations esign prepare --id ES-2026-001
npm run orgos -- operations esign verify-digidoc --id ES-2026-001
```

## Agent ルール

1. 署名は本人の eID カード。モジュールは代理で署名しない
2. sidecar トークン · 証明書 · 署名鍵を出力しない
3. L2/L3 を tracked MD に書かない
4. 完了扱いにできるのは SiVa の検証が通った container だけ
