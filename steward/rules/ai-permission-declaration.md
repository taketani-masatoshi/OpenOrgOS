# AI 権限の宣言 — 散文ではなく manifest で表明する

**版:** 1.0 · **日付:** 2026-09-21
**正本:** 本書 · **ADR:** [0079](../../docs/adr/0079-module-ai-permission-declaration.md) · **Schema:** `schemas/module-security-manifest.ts`

「AI は提案まで。確定は人間」を、文章ではなく宣言で表す。宣言は `module.manifest.yaml`、強制は registrar に置く。

---

## 1. どこに書くか

| 対象 | 書く場所 | 形 |
|------|----------|-----|
| モジュールの能力 | `steward/modules/{id}/module.manifest.yaml` の `security.ai` | 真偽値の宣言 |
| モジュールの外部接点 | 同 `security.permissions` | 面の列挙（既定は空 = deny） |
| Agent の立ち位置 | `steward/core/agents/{id}_agent.md` | 1 行（権限の位置 ＋ ADR 0079 への参照） |

同じ説明を複数の場所に書かない。`agent.md` に振る舞いの解説を増やさない。

---

## 2. 値の決め方

| キー | 既定 | true にできる条件 |
|------|------|-------------------|
| `can_observe` · `can_analyze` · `can_draft` | true | 読取・集計・文案。SSOT を書かない |
| `can_propose` | false | 人間が apply する提案物（plan · draft · 候補）を生成する面があるとき |
| `can_approve` | false | **なし。** 承認は人間の行為であり、モジュールの能力ではない |
| `can_execute` | false | broker 経由の事前委任枠のみ。カタログ内部モジュールでも既定は false |

`security.limits.concurrent_jobs` の慣例は core 2 · JP pack 1（[ADR 0040](../../docs/adr/0040-aia-parallel-runtime.md)）。

---

## 3. 強制点

| 層 | 位置 | 役割 |
|----|------|------|
| capability 解決 | `src/lib/module-capability.ts`（`grantedCapabilitiesFromSecurity`） | 宣言を実行時の許可へ変換 |
| mutation ゲート | `src/cli/registrars/`（`domain.ts` · `orchestration.ts` · `platform.ts`） | `--operator-id` を要求する書込経路 |
| カタログ検査 | `orgos modules check --all` · `orgos platform extension-check` | 未宣言の検出 |

書込ロジックはモジュールの `cli/` ではなく `src/lib/` と `src/commands/` にある。フォルダ構成から権限を推定しない。

---

## 4. 禁止

- `security.ai` を書かずに既定値へ暗黙に頼る（未宣言は「安全」ではなく「未記入」）
- `can_approve: true`
- 事前委任枠の ADR なしに `can_execute: true`
- 生成セクション（`orgos:generated` マーカー）へ手で追記する — `npm run agent:docs:sync` が正本
- 実装のない面を `docs/org-os/ooo-surfaces/` に先に書く

---

## 5. 関連

- [agent-authority-model.md](agent-authority-model.md) — 組織線と作業中継の分離
- [agent_skill_architecture.md](agent_skill_architecture.md) — Agent / Skill と runtime
- [ADR 0080](../../docs/adr/0080-catalog-id-materialism.md) — カタログ id は実体のあるものだけ置く
