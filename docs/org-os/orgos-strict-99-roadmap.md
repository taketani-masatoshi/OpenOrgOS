# OrgOS 厳格 99+ — 現実路線

**版:** 1.0 · **日付:** 2026-06-28  
**正本:** [orgos-scoring-methodology.md](orgos-scoring-methodology.md) · **表示:** `npm run orgos -- status --orgos`

---

## 1. 結論（明示判断）

| 方式 | Steward-side 上限 | 99+ に必要なもの |
|------|:--:|------------------|
| **チェックリスト OrgOS** | **99** | Eco cap **95**（OS_Community なし） |
| **厳格 OrgOS** | **~91** | Eco cap **80** + 本番 Wire/IF 実測 |
| **厳格 99+** | **到達不可**（現 cap） | **OS_Community** 実装 **または** steering の **cap 見直し**（文書化された governance 判断） |

> **禁止:** cap を黙って上げて 99 を出すこと。  
> **許容:** OS_Community リリース後に `STEWARD_ECOSYSTEM_STRICT_CAP` を引き上げる PR + 本書改定。

---

## 2. チェックリスト 99 → 100

| ギャップ | 経路 | 所有者 |
|----------|------|--------|
| Eco 93% → 95 cap | module tier · community CLI 拡張 | Steward-side |
| Eco 95 → 99+ | **OS_Community UI** · Playwright · operator registry | Community Epic |
| IF 95 → 98 | `production_ready` **93%+**（換算式） | Module owners |

---

## 3. 厳格 ~91 → 99+

| 軸 | 現状 cap | 99+ 条件 |
|----|:--:|----------|
| 単独 97 | 本番 systemd 常駐 · standalone 本番証跡 | Ops |
| 形式 90 | 社内 MD 二層は **意図的** — 100 化は別 Epic | Product |
| IF 実測 ~89 | module **93%+** production_ready | Module |
| Wire 91 | mTLS 常駐 · Hub 鍵自動ローテ | Ops |
| **Eco 80** | **OS_Community** · committee 法域レジストリ | **Community** |

**加重試算:** Eco 80→95（+1.5pt 総合）· IF +4 · Wire +9 … **99 厳格は Community + module + ops の合わせ技**。

---

## 4. OpenOrgOS Core 厳格（CI 連動 · 2026-06-28）

| 状態 | Core 厳格 |
|------|:--:|
| artifact のみ（`npm test` 未実行） | **92** cap |
| `npm test` 失敗 | **85** cap |
| `npm test` 成功（`.orgos-ci/test-suite.json`） | checklist に **追従**（典型 **100**） |

CI: `npm test` 成功時に marker 書込 · `ORGOS_TEST_SUITE_PASSED=1` も可。

---

## 5. 次アクション（優先）

1. **OS_Community** — [c4-community-backlog.md](c4-community-backlog.md)  
2. module `production_ready` 底上げ — jurisdiction modules  
3. 本番 Wire — relay/api systemd · Hub 鍵ローテ  
4. cap 見直し PR — steering 承認 + 本書 · methodology 同時改定

---

## 6. 改定履歴

| 日付 | 内容 |
|------|------|
| 2026-06-28 | 初版 — Steward-side 上限 · 99+ = Community or governance |
