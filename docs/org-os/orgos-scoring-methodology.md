# OrgOS · OpenOrgOS Core — 採点方法論

**版:** 1.0 · **日付:** 2026-06-28  
**正本:** 本書 · 実装: `src/lib/protocol/orgos-readiness.ts` · `openorgos-core-readiness.ts`  
**表示:** `npm run orgos -- status --orgos`

---

## 1. 二重採点（矛盾解消の原則）

| 方式 | ラベル | 意味 | 用途 |
|------|--------|------|------|
| **A** | **チェックリスト採点** | リポジトリ内 artifact · テストファイル · CI 脚本の **存在と構成** | 回帰防止 · PR ゲート |
| **B** | **厳格採点** | 本番運用 · 外部検証 · Community · module tier の **未達を cap** | 対外説明 · ロードマップ |

> **禁止:** チェックリスト採点だけを「OS として完成」と宣言すること。  
> **framework-assessment §13** は **両方** を記載する。

---

## 2. OrgOS 五軸（加重同一）

| 軸 | 重み |
|----|:--:|
| 単独閉ループ（C1） | 35% |
| 形式統一（C3） | 25% |
| インターフェース（C2） | 15% |
| Wire 証拠 | 15% |
| エコシステム（C4） | 10% |

### 2.1 チェックリスト採点（A）

- 実装: `computeOrgOsReadiness()` — artifact 存在 · CI テナント数 · module 閾値換算
- **上限:** Eco **95**（Steward-side · OS_Community なし）
- 典型値（2026-06-28）: **99/100**

### 2.2 厳格採点（B）

- 実装: `computeOrgOsStrictReadiness()` — 各軸に **運用 cap** を適用
- IF 軸 = `production_ready` **実測 %**（換算式で水増ししない）
- Eco 上限 **80**（Steward-side · Community UI 未実装）
- **Steward-side 厳格 99+ は到達不可** — 路線: [orgos-strict-99-roadmap.md](orgos-strict-99-roadmap.md)
- 典型値（2026-06-28）: **~91/100**

| 軸 | 厳格 cap の根拠 |
|----|----------------|
| 単独 | 97 — standalone E2E 済 · 本番常駐 systemd は任意 |
| 形式 | 90 — witness emit 済 · **社内 MD 二層は意図的に残る** |
| IF | module **実測 %**（89% 等） |
| Wire | 91 base · **99** when mal pilot production evidence OK (`wire-production-evidence.ts`) |
| Eco | 80 base · **92** Steward publish · **98** Community integration OK (`eco-production-evidence.ts`) |

---

## 3. OpenOrgOS Core 四要素（均等 25%）

| 方式 | 典型値 | 根拠 |
|------|:--:|------|
| チェックリスト（A） | **100** | 四要素の schema · 実装 · テストファイルが揃う |
| 厳格（B） | **92–100** | **`npm test` 成否連動** — 未検証 92 · 失敗 85 · 成功 = checklist |

実装: `test-suite-status.ts` · marker `.orgos-ci/test-suite.json`（gitignore）

---

## 4. 批判への対応マップ

| 批判 | 対応 | 修正先 |
|------|------|--------|
| 99 は採点器差し替え | **厳格採点を正本に追加** · status に両方表示 | 本書 · `os-score.ts` · §13 |
| Core 100 は存在確認のみ | 厳格 **92–100** · **`npm test` 連動** | 本書 · `test-suite-status.ts` |
| orgos-completion-plan §2 が「形式統一 低」のまま | **2026-06-28 スナップショット更新** | `orgos-completion-plan.md` §2 |
| orgos-score-baseline.yaml が 100 と矛盾 | **deprecated · 採点は TS 正本** | `orgos-score-baseline.yaml` |
| openorgos §6.2 と改定履歴 1.4 が 82/100 | **§6.2 二重採点 · 履歴追記** | `openorgos-protocol-requirements.md` |
| orgos-99-plan が達成を暗示 | **チェックリスト vs 厳格を分離** | `orgos-99-plan.md` |
| FR-WT-07 を「今回実装」と誤解 | **実装済み日を明記** · doc ✓ のみ | `witness-hub-requirements.md` §14 |

---

## 5. 確認

```bash
npm run orgos -- status --orgos
npm run validate:protocol:tenants
npm test -- orgos-readiness test-suite-status
```

---

## 6. 改定履歴

| 日付 | 版 | 内容 |
|------|-----|------|
| 2026-06-28 | 1.0 | 二重採点正本 · 批判対応マップ · 文書矛盾解消 |
| 2026-06-28 | 1.1 | Core 厳格 CI 連動 · [orgos-strict-99-roadmap.md](orgos-strict-99-roadmap.md) |
