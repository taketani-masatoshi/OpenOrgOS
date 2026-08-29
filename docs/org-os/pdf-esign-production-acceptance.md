# pdf_esign 本番受入チェックリスト（DigiDoc / SiVa）

**対象:** Phase D2/D3 厳格化後 · **ADR 0014** · Track B 計画 [pdf-embed-and-digidoc-production-plan.md](./pdf-embed-and-digidoc-production-plan.md)  
**原則:** 鍵・PIN・カード番号・個人識別子は OrgOS / Git / チャットに残さない。  
**運用前提（2026-07-14）:** SiVa 当面 = **MAL Mac** · 実カード署名者 = **代表取締役 段**（e-Residency / digi-ID 保有）

---

## A. 機械検証（実装者 / CI） — BP1

| # | 項目 | 証跡 |
|---|------|------|
| A1 | `npx vitest run tests/pdf-esign.test.ts` 緑 | Vitest |
| A2 | `ORGOS_SIVA_MODE` 未設定時の既定が **live** | `defaults siva mode to live when unset` |
| A3 | mock 成功でもケース `status` が **completed にならない** | `mock TOTAL-PASSED does not nationally complete` |
| A4 | live 契約フィクスチャで `TOTAL-PASSED` → completed · 非 PASSED / schema 不正 → failed | `live SiVa TOTAL-PASSED completes; …` |
| A5 | HTTPS 必須 · loopback HTTP はフラグ無しで拒否 | `rejects non-HTTPS SiVa without loopback flag` |
| A6 | ASiC: 過大サイズ · 危険な entry 名・不正 mimetype を拒否 | `rejects unsafe/oversize ASiC…` · `rejects asice when file exceeds maxAsiceBytes` |
| A7 | sidecar: Bearer · 非 PDF 拒否 · create（Docker 任意） | `prepare skeleton requires auth…` · `npm run smoke:digidoc-sidecar` |
| A8 | `operations esign ready --json` が token を露出しない | `esign ready report omits sidecar token` |

- [x] A1–A6 · A8 — Vitest（BP1）
- [x] A7 — HTTP mock は Vitest · **実 Docker** は `npm run smoke:digidoc-sidecar`（任意・Docker 必要）

```bash
npx vitest run tests/pdf-esign.test.ts
# optional docker smoke:
npm run smoke:digidoc-sidecar
```

---

## B. SiVa 自前ホスト（運用） — BP2 · ホスト = MAL Mac

手順正本: [pdf-esign-siva-mal-mac.md](./pdf-esign-siva-mal-mac.md)

- [x] open-eid 公式 **test compose を本番に使っていない**（`setup-siva-mal-mac.sh` は JAR のみ）
- [x] ビルド/起動スクリプト · mal `digidoc.yaml`（loopback 許可）· probe 用意（2026-07-14）
- [x] **ホスト上で** `setup-siva-mal-mac.sh build && start` 完了（JDK 17 · 初回 TSL ~2 min · 2026-07-15）
- [x] reverse proxy で HTTPS **または** 当面 loopback + `ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK=1`（当面 loopback）
- [x] OCSP / TSP egress 確認（起動時 EU TSL 取得成功 · 署名検証時も同 egress）
- [x] `npm run siva:mal-mac:probe` が PASS（`esign ready` で `siva_configured=true`）
- [x] 監視: `services/siva/run/siva.log` · `setup-siva-mal-mac.sh status`

**BP2 クローズ（2026-07-15）:** §B 完了 · 次は §C（段 + DigiDoc4 カード）。
---

## C. 実カード E2E（ユーザー操作 · 必須） — BP3 · 署名者 = 段

CEO / 署名者（**段**）が DigiDoc4 + e-Residency / digi-ID カードで実施。

1. サイドカー + live SiVa（MAL Mac）を用意し `operations esign ready` が妥当であること  
2. `create` → `prepare --skeleton` → `send`（本番は `--approval-id`）  
3. DigiDoc4 で `unsigned.asice`（または PDF）を開き **カードで署名** → `.asice` 保存  
4. PIN・カードをチャットに貼らない  
5. 実行:

```bash
ORGOS_SIVA_MODE=live \
ORGOS_SIVA_BASE_URL=https://YOUR_SIVA_OR_LOOPBACK \
npm run orgos -- --tenant mal operations esign accept-live --id ES-YYYY-NNN --asice ./signed.asice --json
```

### 合否（証跡）

| 項目 | 期待 |
|------|------|
| `verify.nationally_verified` | `true` |
| `case.status` | `completed` |
| `case.siva_mode` | `live` |
| `case.siva_indication` | `TOTAL-PASSED` |
| `case.siva_response_digest` | 64 hex（再 verify で一致） |
| `case.siva_signatures_count` | ≥ 1 かつ valid と同数 |

改ざん試験（任意）: `.asice` を破壊して再 verify → `failed` / 非 PASSED。

- [ ] §C 実施済み（日付 · ES-* id のみ L1 にメモ可 · PIN 禁止）

---

## D. 定義された「9点超」

| 観点 | 機械側で満たす | 人間カード側 |
|------|----------------|--------------|
| 思想整合 | ESP なし · mock 非完了 | — |
| D2 SiVa | live schema · digest · URL ポリシー | 実 TOTAL-PASSED |
| D3 sidecar | auth · limits · health · compose | DigiDoc4 で開いて署名可能 |
| E2E | Vitest · 任意 Docker smoke | **本節 C の証跡** |

**BP2 時点:** §A+§B 完了 · **国家運用合否は §C（実カード）待ち**。
