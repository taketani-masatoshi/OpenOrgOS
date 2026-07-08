# OrgOS · OpenOrgOS · Agent — 用語集

**版:** 1.3 · **日付:** 2026-07-07  
**正本:** 本書（日本語）· Core 概念の英語正本: [openorgos-core-philosophy.md](openorgos-core-philosophy.md) · [language-policy.md](language-policy.md)  
**概念整理（JP）:** [openorg-ooo-basic-philosophy.md](openorg-ooo-basic-philosophy.md) — OpenOrg · OOO · State/Event モデル

---

## 1. 製品名の整理（2026-06-28 改定）

| 会話・新規文書 | 意味 | 旧称（obsolete） |
|----------------|------|------------------|
| **OrgOS** | **組織 OS 製品全体** — Core · Module · Wire · Witness · Agent · CLI · テナント | ~~Steward OS（製品名として）~~ |
| **Steward Agent** | **経営統括コア Agent** — 秘書 Agent と**同列** | ~~Steward OS（製品と混同）~~ · Executive Steward（英語役割名） |
| **Steward OS** | **実装詳細ブランド（レガシー）** — リポジトリ `OS_Steward` · ディレクトリ `steward/` | 製品呼称としては使わない |
| **orgos-reference** | npm パッケージ · CLI `orgos` | 旧 `steward-os` / `steward` は非推奨 · [cli-migration.md](cli-migration.md) |

> **要点:** これまで「Steward OS」と呼んでいた**製品全体**は **OrgOS**。  
> **Steward** は製品名ではなく **Agent 名**（Secretary · Finance と同じ tier）。

---

## 2. OrgOS の全体像

```
OrgOS（組織 OS · 製品）                 … 旧「Steward OS 製品」に相当
├── OpenOrgOS Core（コア）              … プロトocol 核 · LLM 不要 · 四要素
├── Module 連結（I1）                   … 法域 pack · 業務 module
├── Wire（ワイヤ）                      … 外部 Org 連携 · deliver
├── Witness（ウィットネス）             … 取引補助 · 第三者証拠
└── Implementation（実装層）
    ├── Steward Agent（経営統括）       … id: executive_steward
    ├── Secretary Agent（秘書）
    ├── 他コア Agent（Finance 等）
    ├── Module Agent（業務専門）
    └── Operator（人間）· Skill · CLI
```

| 層 | 日本語 | 英語 | LLM |
|----|--------|------|:---:|
| **OrgOS** | 組織 OS | OrgOS | 一部 |
| OpenOrgOS Core | コア | OpenOrgOS Core | **不要** |
| Wire / Witness | ワイヤ / ウィットネス | Wire · Witness | 不要 |
| **Steward Agent** | ステュワード / 経営統括 | Steward Agent · `executive_steward` | **可** |
| Secretary Agent | 秘書 | Secretary · `secretary` | **可** |

**OrgOS ⊃ OpenOrgOS Core** — Core は OrgOS の一部。OrgOS ≠ Core のみ。

---

## 3. 「Steward」の三つの意味（混同防止）

| 表記 | 種別 | 使う？ |
|------|------|:------:|
| **OrgOS** | 製品名 | ○ 会話 · 設計文書 |
| **Steward Agent** | コア Agent（経営統括） | ○ |
| **Steward OS** | 実装ディレクトリ `steward/` · レガシー表記 | △ 実装文脈のみ |
| `npm run orgos` | CLI コマンド（推奨） | ○ コード |
| `npm run steward` | CLI コマンド（非推奨） | △ 互換 |
| `steward/core/` | フレームワークパス | ○ パス |
| ~~Steward = 製品~~ | — | **× 禁止** |

### 3.1 Steward Agent（経営統括）

| 項目 | 値 |
|------|-----|
| **日本語** | ステュワード Agent · 経営統括 Agent |
| **英語役割名** | Executive Steward（agent.md 正本） |
| **registry id** | `executive_steward` |
| **定義** | [executive_steward_agent.md](../../steward/core/agents/executive_steward_agent.md) |
| **Secretary との関係** | **同列のコア Agent** — Secretary は秘書 · Steward は統括・委譲 |
| **Wire** | 送らない — 判断 · 要約 · 委譲のみ |

### 3.2 Secretary Agent（秘書）

| 項目 | 値 |
|------|-----|
| **registry id** | `secretary` |
| **Wire** | **起案のみ**（`protocol notice draft`）— 送信は Operator + CLI |
| **Steward への関係** | 管轄外は **Steward Agent へエスカレーション** |

---

## 4. OrgOS の四構成（Core · Module · Wire · Witness）

| # | 構成 | 境界 | 正本 |
|---|------|------|------|
| 1 | **OpenOrgOS Core** | 四要素 · 組織間意味論 | `schemas/protocol/` |
| 2 | **Module 連結** | I1 · Adapter | `steward/modules/` · jurisdiction-packs |
| 3 | **Wire** | I2–I3 P2P | `src/lib/wire/` · `protocol deliver` |
| 4 | **Witness** | I3 第三者 | `witness-*` · Hub |

### Core 四要素

Org Event Model · Identity exchange · Authority delegation · Auditability — 詳細 [openorgos-core-philosophy.md](openorgos-core-philosophy.md)

### Wire vs Witness

| | Wire | Witness |
|---|------|---------|
| 主体 | ピア Org | 中立 Hub |
| 役割 | envelope **配送** | 取引 **証明** |
| Agent | 非関与 | 非関与 |

### Wire Gateway（I3-a エッジ · v0.1）

| | Wire Gateway | Wire（Core） | Witness |
|---|--------------|--------------|---------|
| 層 | I3-a 外部公開 | I2–I3 正本 | I3-c 証明 |
| 役割 | **配送のみ** · payload 非解釈 | `EventEnvelope` | digest |
| 正本 | [wire-gateway-requirements.md](wire-gateway-requirements.md) | [wire-gateway-wire-protocol.md](wire-gateway-wire-protocol.md) | org-event schema | witness-pool |

**会話での統一:** 組織間配送エッジ = **Wire Gateway** · 意味論正本 = **Wire** · 拠点証明 = **Hub** · 国家インフラ = **Gov Gateway**。

### 4.1 Gov Gateway Adapter（国家規格ラップ）

| | Gov Gateway Adapter | Wire | Hub |
|---|---------------------|------|-----|
| 層 | I3-b 輸送・プロファイル | I2–I3 OpenOrgOS 正本 | Witness 証明 |
| 例 | X-Road · e-Gov · Georgia 3G | `EventEnvelope` | `hub_id` digest |
| 正本 | [gov-gateway-adapter-spec.md](gov-gateway-adapter-spec.md) · [gov-gateway-adapters.md](gov-gateway-adapters.md) | org-event schema | witness-pool |

**Wire 緩衝層:** OpenOrgOS 正本は常に `EventEnvelope`。国家形式は `GovGatewayAdapter`（`xroad_v7` · `jp_egov_central` · `ge_gov_gateway_3g`）がラップする。メモ: [memos/00-wire-buffer-layer.md](memos/00-wire-buffer-layer.md)。

**会話での統一:** 組織間 = **Wire** · 拠点証明 = **Hub** · 国家インフラ接続 = **Gov Gateway**（Wire のラッパー）。

---

## 5. Agent 三層（Implementation 内）

| tier | 日本語 | 例 | 定義 |
|------|--------|-----|------|
| **core** | コア Agent | **Steward** · Secretary · Finance … | `steward/core/agents/` |
| **module** | 業務 Agent | rental · hospitality | `steward/modules/{id}/agent.md` |
| **extension** | 拡張 Agent（計画） | human_resources | registry `extensions` |

**Operator** = 人間承認者（Agent ではない）· **Skill** = 手順（Agent ではない）

---

## 6. レガシー表記の読み替え

| 旧表記（文書に残存しうる） | 読み替え |
|----------------------------|----------|
| Steward OS 製品 | **OrgOS** |
| Steward OS フレームワーク | **OrgOS 参照実装**（本リポジトリ） |
| Executive Steward | **Steward Agent**（英語役割名として残してよい） |
| 8 Agent | **Steward + Secretary + 4 部門 + Module Agent** |
| steward CLI | **`orgos` CLI**（旧 `steward` 非推奨） — [cli-migration.md](cli-migration.md) |
| `steward-os` npm | **`orgos-reference`** npm |
| `/opt/steward-os` deploy | **`/opt/orgos-reference`**（`STEWARD_ROOT` フォールバック可） |

---

## 7. プロトコル表記

| 日本語 | コード |
|--------|--------|
| プロトコル | `protocol` · `schemas/protocol/` |

---

## 8. 完成度

| 用語 | 意味 |
|------|------|
| OrgOS 完成度 | [orgos-scoring-methodology.md](orgos-scoring-methodology.md) |
| OpenOrgOS Core 完成度 | 四要素 · `status --orgos` |

---

## 9. よくある混同

| 混同 | 正しい |
|------|--------|
| Steward OS = 製品 | **OrgOS = 製品** · Steward OS = 実装ブランド |
| Steward = 製品 | **Steward = Agent**（Secretary と同列） |
| OrgOS = Core のみ | OrgOS = **Core + Module + Wire + Witness + Agent** |
| Secretary が Wire 送信 | Secretary **起案** → Operator **approve** → CLI **deliver** |

---

## 10. 改定履歴

| 日付 | 版 | 内容 |
|------|-----|------|
| 2026-06-28 | 1.0 | 初版 |
| 2026-06-28 | **1.1** | **OrgOS = 製品** · **Steward = Agent** · Steward OS を実装ブランドに降格 |
| 2026-06-28 | **1.2** | npm **`orgos-reference`** · CLI **`orgos`** · [cli-migration.md](cli-migration.md) |
| 2026-07-06 | **1.3** | [openorg-ooo-basic-philosophy.md](openorg-ooo-basic-philosophy.md) への索引追加 |
| 2026-07-07 | **1.4** | Gov Gateway Adapter（X-Road · e-Gov · Georgia 3G）索引 |
