# Direction B · C — 並行チケット（2026-06）

**正本:** [framework-backlog.md](framework-backlog.md) · [tjs-11-target-jurisdictions.md](org-os/tjs-11-target-jurisdictions.md)

---

## Direction B — TJS-11 法域 pack

| チケット | 内容 | 状態 | テスト |
|---------|------|:----:|--------|
| **B-TKT-1** | AU pack + au-demo · countries/registry/lock | [x] | `jurisdiction.test.ts` · `tjs-11-progress.test.ts` |
| **B-TKT-2** | TW pack + tw-demo · zh-TW locale | [x] | 同上 |
| **B-TKT-3** | TJS-11 進捗計測 · assessment §11 更新 | [x] | `tjs-11-progress.test.ts` |
| **B-TKT-4** | MY pack + ms locale | [x] | ORG-J8-5 |
| **B-TKT-5** | CN pack + cn-demo | [x] | ORG-J8-3 |
| **B-TKT-6** | TJS-EU 方針確定（**案 A** EU メタ pack） | [x] | ORG-J8-1 · `tjs-11-progress.test.ts` |

**スキャフォールド:** `node scripts/scaffold-jurisdiction-pack.mjs {AU|TW|MY|CN|AE|RU|EU}` · `node scripts/scaffold-demo-tenant.mjs {…}`

---

## Direction C — モジュール tier 昇格 · 選別

| チケット | 内容 | 状態 | テスト |
|---------|------|:----:|--------|
| **C-TKT-1** | ecommerce → production_ready + invoice seed | [x] | `module-production-tier.test.ts` |
| **C-TKT-2** | production_ready 6 件 catalog 契約一括検証 | [x] | `module-production-tier.test.ts` |
| **C-TKT-3** | professional_services · saas invoice manifest 回帰 | [x] | `module-production-tier.test.ts` |
| **C-TKT-4** | membership → production（invoice 設計） | [x] | `module-production-tier.test.ts` |
| **C-TKT-5** | demo で EC billing バインド例 | [x] | `module-production-tier.test.ts` |

**Wave 2（2026-06-26）:** 12 モジュール → production_ready（staffing · event_space · retail · logistics · clinic · construction · education · VC · software_out · event_ops · brokerage · PM）— **19/25 (76%)**

**昇格 DoD:** `required_seeds` invoice-* · `readiness.yaml` production_ready · `modules check {id}` 0 件

---

## 品質ゲート（両方向共通）

```bash
npm test -- tests/jurisdiction.test.ts tests/tjs-11-progress.test.ts tests/module-production-tier.test.ts
npm run check   # TJS-11 demo validate 全件含む
```
