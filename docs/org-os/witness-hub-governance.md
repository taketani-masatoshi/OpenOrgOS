# Witness Hub ガバナンス — Model Y と OpenOrgOS 運営 Org

**Status:** 合意草案 · 2026-07-06（Hub 仮計画 §7.A · **最終系 §7.B**）  
**Parent:** [witness-hub-requirements.md](witness-hub-requirements.md) · [openorgos-core-philosophy.md](openorgos-core-philosophy.md)  
**関連:** [org-dissolution-witness-checklist.md](org-dissolution-witness-checklist.md) · [`trusted-hubs-oorgos.org.yaml`](../../steward/platform/protocol/trusted-hubs-oorgos.org.yaml)

---

## 1. 問題意識

OpenOrgOS を運営する当組織も OrgOS の利用者である。Witness Hub を「比較的頑張って」運ぶ場合、**中央集権的な単一正本**に見えないか。

**結論:** 運営 Org が Hub を運ぶこと自体は Model Y と両立する。条件は **(a) プールの 1 ノード（アンカー Hub）に留める** **(b) quorum は k≥3 · n≥4** **(c) アンカー Hub の digest 台帳は必ず他ノードへコピー** **(d) 寄付本体が全社 Hub 運営を背負わない**。

---

## 2. 役割の分離

| 主体 | 維持するもの | 維持しないもの |
|------|-------------|---------------|
| **OpenOrgOS Foundation / 寄付本体** | Core スキーマ · CLI · 仕様 · Community 基盤 · **参考レジストリ**（oorgos.org） | 全テナントの Hub 単独運用 · envelope 全文保管 |
| **OpenOrgOS 運営 Org**（日常運営 · 配分決定） | 自テナント · **HUB-APAC-JP 等 1 台** · 自社 wire · **grant 正本・全 chapter 配分 = タリン Treasury** | 他 Org の正本 · quorum の唯一判定者 · **日本法人への運営本部集約** |
| **Community / Academy 運営** | openorgos.net · 教材 API | Witness Hub（別レイヤ） |
| **各利用 Org** | outbox / inbox · receipt キャッシュ · pool pin | 他 Org の Hub データ |
| **第三者 Hub operator** | 自 Hub の digest 台帳 | プロトコル仕様 · レジストリ独占 |

Linux カーネル / LF に近い分離: **プロトコルは寄付で共通資産**、**Hub 運用は distrib 的に分散**。

---

## 3. Model Y（合意）

```
Org A ──wire──► Org B
  │                │
  └── fan-out ─────┴──► [Hub-1] [Hub-2] [Hub-3]
                         ↑ OpenOrgOS 運営 Org は Hub-1 のみ（例）
```

| 原則 | 内容 |
|------|------|
| **分散プール** | 複数 `hub_id` · 独立 SoT · gossip で eventual sync |
| **quorum** | 本番最小 **k=3 · n≥4**（3-of-4）— アンカー Hub 停止後も 3 台で成立 |
| **アンカー Hub** | 運営 Org が厚く運ぶ 1 台 · **消えてよい** · 正本ではない |
| **コピー必須** | アンカー Hub の attestation / receipt は **≥2 の独立 peer Hub** に gossip 複製 |
| **digest のみ** | Hub は N-04 — 契約本文を集約しない |
| **解散** | [org-dissolution-witness-checklist.md](org-dissolution-witness-checklist.md) — export + custodian |
| **レジストリ** | oorgos.org は **pin 用参考一覧** — ルーティング権限ではない |

### 3.1 本番最小構成（k≥3）

| 設定 | 意味 | アンカー Hub 喪失後 |
|------|------|---------------------|
| **n=3 · k=3** | 3 台すべてが mutually_confirmed 必要 | **quorum 不可**（2 台のみ）— 非推奨 |
| **n=4 · k=3** | 3-of-4 · **推奨最小** | 残 3 台で quorum **成立可能** |
| **n=5 · k=3** | 3-of-5 | 残 4 台 — 2 台同時停止にも余裕 |

```yaml
# tenants/{id}/data/protocol/witness-pool.yaml — 本番最小例
enabled: true
quorum:
  mode: k_of_n
  k: 3
hubs:
  - hub_id: HUB-OPENORGOS-JP      # アンカー（運営 Org）
  - hub_id: HUB-COMMUNITY-JP-01   # 独立 operator
  - hub_id: HUB-COMMUNITY-JP-02
  - hub_id: HUB-COMMUNITY-JP-03   # 4 台目 — k=3 の余裕
```

**k=3 の意味:** 「3 つの独立 Witness が同じ digest を確認した」という **証拠の厚み**。単一アンカーの主張より強い。

### 3.2 アンカー Hub のコピー（必須）

アンカー Hub（例: `HUB-OPENORGOS-JP`）は SLA を厚くするが、**データの独占保管者ではない**。以下 3 層すべてを満たす。

| 層 | 主体 | 内容 |
|----|------|------|
| **L1 · Hub 間 gossip** | peer Hub ≥2 | `hub-federation.yaml` + gossip で attestation を複製 · 各 Hub が自 `hub_id` で receipt 再生成 |
| **L2 · Org receipt キャッシュ** | 各利用 Org | `witness-receipts/{event_id}/{hub_id}.json` — FR-P05 · **各 Org が必ず保持** |
| **L3 · オフライン export** | アンカー operator | 日次 `hub anchor-export` · `tar` バックアップ · 解散時 custodian 引渡 |

**アンカー Hub が消えてよい理由:** L1+L2 により digest 台帳と receipt は **他 Hub と各 Org に既に存在**。アンカーは「入りやすい入口」であり SoT ではない。

**運用チェック（月次）:**

```bash
# federation · gossip が生きている
npm run orgos -- hub federation show --hub-id HUB-OPENORGOS-JP --data-dir ./data/hub-openorgos-jp
npm run orgos -- hub gossip sync-all --hub-id HUB-COMMUNITY-JP-01

# アンカー停止を想定 — 残 3 Hub で quorum が取れること
npm run orgos -- --tenant <id> protocol witness pool status
npm run orgos -- --tenant <id> protocol witness verify --event-id <uuid>
```

---

## 4. trusted-hubs レジストリ（oorgos.org）

**正本（公開予定）:** `https://oorgos.org/protocol/trusted-hubs.yaml`
**Steward 草案:** [`steward/platform/protocol/trusted-hubs-oorgos.org.yaml`](../../steward/platform/protocol/trusted-hubs-oorgos.org.yaml)

| 項目 | 説明 |
|------|------|
| **性質** | 法域別の **参考 Hub 一覧** — national committee 必須レジストリ（N-08 非目的）とは別枠の platform 公開物 |
| **更新** | PR + 公開鍵 pin 検証 · `hub export-public-key` 出力と一致必須 |
| **priority** | Org が `init-trusted` するときの並び · **権限順位ではない** |
| **retire** | YAML 末尾 `retired_hubs`（ドキュメント）— 利用 Org は `witness-pool.yaml` を手動更新 |

```bash
# 利用 Org — レジストリから pool を bootstrap（公開鍵 pin）
npm run orgos -- --tenant <id> protocol witness pool init-trusted --jurisdiction JP
# 本番前: hubs[] >= 4 · quorum.k = 3 · アンカー以外は独立 operator
```

**中央集権にしないための運用ルール:**

1. レジストリに **アンカー Hub だけ** を載せない（community / 第三者スロット ≥3）
2. **n≥4 · k=3** — アンカー停止後も残 3 Hub で quorum 成立
3. アンカー Hub は **gossip で必ず peer にコピー**（§3.2 L1）— アンカー単独保管禁止
4. レジストリ URL は **HTTPS 固定 pin** — 利用 Org は初回のみ fetch · 以降は `witness-pool.yaml` が SoT

---

## 5. 「運営 Org が Hub を多めに持つ」ことの位置づけ

| 懸念 | 回答 |
|------|------|
| 単一障害点 | **k=3 · n≥4** + gossip コピー — アンカー停止可 |
| データ独占 | digest のみ · **L1 gossip + L2 Org キャッシュ** でアンカー非依存 |
| ガバナンス支配 | レジストリは参考 · wire 承認権は各 Org 内（N-03） |
| 寄付本体の負担 | Hub 物理運用は **運営 Org の OPEX** · Foundation は仕様と公開レジストリ |

運営 Org が Hub SLA を厚くするのは **可用性への貢献** であり、**プロトコル上の中央管理者** ではない。

---

## 6. 解散・移管

運営 Org または Hub operator 撤退時:

1. [org-dissolution-witness-checklist.md](org-dissolution-witness-checklist.md) Phase 2–5
2. `trusted-hubs-oorgos.org.yaml` から該当 `hub_id` を retire
3. 利用 Org へ **pool 再 pin** を Community / リリースノートで通知（強制更新 API なし）

---

## 7. グローバル Witness Hub 都市選定

**Regional Chapter Witness Pool** は段階的に拡張する。各 Hub は **digest のみ** · **独立 SoT** · **k-of-n quorum** の 1 ノード。**運営本部・grant 正本はタリン Treasury**（§7.0）· 東京は薄い APAC のみ。

| 文書上のプラン | 節 | グローバル Hub 数 | 位置づけ |
|---------------|-----|------------------|----------|
| **仮計画** | §7.A | **7**（FRA 含む） | 2026-07-05 までの合意草案 · **履歴・比較用に保持** |
| **最終系** | §7.B | **8**（IE · TR 追加 · **FRA 除外**） | **Wave · レジストリ · 運用の正** |

アフリカ Continental Pool（+3）は **両プラン共通**（§7.C）。法人スタック（タリン Treasury / Fund · ドバイ · 東京 · オークランド trust）は **両プラン共通**。

### 7.0 法人スタック（両プラン共通）

```
OpenOrgOS Endowment Trust（オークランド · Wave 2）
  ├─ 株主 / settlor 上位 — タリン OÜ · タリン Fund · ドバイ FZCO（創業者個人は直接大株主にしない）
  └─ trust deed — 子 · 孫を受益者（承継正本）

タリン OÜ（Wave 1） — 全拠点統括本部 · Treasury（お財布）· grant 配分正本 · HUB-EU-EE
タリン Fund（Wave 2 · 別法人） — 投資専用財布 · 事業/戦略投資（Treasury とは口座・帳簿分離）
ドバイ FZCO（Wave 1） — ME 地域財布 · HUB-ME · substance（配分はタリン Treasury が決定）
東京（Wave 1） — HUB-APAC-JP のみ · 認定 NPO 寄付窓口（任意）· 留保・運営本部なし
```

| 機能 | 正本の置き場 | 東京に置かないもの |
|------|-------------|-------------------|
| **全拠点統括 · 配分決定** | **タリン OÜ（Treasury）** | 運営本部 · 利益留保 |
| **chapter への投資/grant** | **タリン OÜ** — どの拠点に何を出すかを決定 | — |
| **事業・金融投資** | **タリン Fund**（OÜ 子会社 or 投資ファンド枠 · **Treasury と別**） | — |
| ME 地域財布 | **ドバイ FZCO**（Treasury から配分） | — |
| 子孫への資産承継 | **オークランド trust**（Wave 2） | 株式・基金の日本集約 |
| APAC Witness · 国内寄付 | **東京（薄い）** | 法人所得税ベースの構築 |

### 7.0.1 タリン二層 — Treasury と Fund

| 層 | 法人（案） | 役割 | Treasury / Fund |
|----|-----------|------|-----------------|
| **統括本部 + お財布** | **タリン OÜ** | 全 chapter（東京 · ドバイ · IE · TR · NY · SA · AF · Auckland 等）の **OPEX / CAPEX / seed grant** を **一元決定・送金** · grant ledger 正本 · 契約名義 · `HUB-EU-EE` | **Treasury** |
| **投資ファンド** | **OpenOrgOS Tallinn Fund**（別 OÜ / AS · Wave 2） | エコシステム VC · 戦略持分 · 有価証券等 — **chapter 運営費の配分とは別目的** · 投資委員会ガバナンス | **Fund** |

**資金フロー（原則）:**

```
寄付 · 事業収益 · chapter からの upstream
        │
        ▼
  タリン OÜ Treasury ──grant/OPEX/CAPEX──► 各 chapter（東京 · ドバイ · IE · TR · …）
        │
        │  投資ポリシーに基づく capital call のみ
        ▼
  タリン Fund ──投資──► 被投資先 / 資産
        │
        └── 分配・ exit 収益 ──► Treasury へ（再配分） or Fund 再投資（ポリシー）
```

**配分決定（Treasury）の例:**

| 配分種別 | 決定主体 | 対象例 |
|----------|----------|--------|
| **存在維持 seed** | タリン OÜ（年次予算） | 各 chapter ~100 万/年 |
| **本番 SLA** | タリン OÜ（Wave gate 後） | DC · 鍵 · 監査 300–500 万/chapter |
| **Wave 開設 CAPEX** | タリン OÜ（Wave 計画） | 新 Hub 立上げ · DC 契約 |
| **地域委託** | タリン OÜ → 現地薄い法人 | AF 3 · 東京 GK への cost-only 委託 |
| **ME 地域留保** | タリン OÜ が配分 → ドバイ FZCO | ME 固有 OPEX · substance 維持 |

**Fund 投資（Treasury とは別）の例:**

| 投資種別 | 決定主体 | 備考 |
|----------|----------|------|
| OrgOS エコシステム | タリン Fund 投資委員会 | 利用 Org · operator · インフラ |
| 戦略持分 | 同上 | ケーブル · DC · パートナー |
| 流動性 / 準備資産 | 同上 | Treasury とは口座分離 |

**ガバナンス分離:** Treasury の **chapter 配分** と Fund の **投資判断** は議事・帳簿・口座を分ける。Fund から chapter へ直接 grant しない（**Fund → Treasury → chapter** または exit 収益の再配分）。

```yaml
# タリン — 論理エンティティ（物理は同一都市 · 法人は分離）
tallinn:
  hq_treasury:
    legal: OpenOrgOS OÜ  # e-Residency · Wave 1
    roles: [global_hq, grant_ledger, chapter_allocation, HUB-EU-EE]
  investment_fund:
    legal: OpenOrgOS Fund OÜ  # or AS · Wave 2
    roles: [venture, strategic, securities]
    governance: investment_committee  # Treasury 理事会とメンバー重複可 · 議決は分離
    shareholder: OpenOrgOS Endowment Trust  # Wave 2 · Tallinn OÜ と同じ上位
```

---

### 7.A 仮計画（Provisional · 2026-07-05 合意草案）

> **位置づけ:** 検討過程のスナップショット。**新規実装・Wave gate・レジストリの正は §7.B 最終系** を用いる。本節は差分比較と履歴のため削除しない。

#### 7.A.1 グローバル 7 都市（仮計画）

| # | 都市 | `hub_id` | Wave | 主役 |
|---|------|----------|------|------|
| 1 | **東京** | `HUB-APAC-JP` | 1 | 薄い APAC · 国内寄付窓口 |
| 2 | **ドバイ**（DIFC） | `HUB-ME` | 1 | ME Hub · ME 地域財布 |
| 3 | **タリン** | `HUB-EU-EE` | 1 | 統括本部 · Treasury |
| 4 | **フランクフルト** | `HUB-EU-FRA` | 2 | EU Witness · wire コスト精算 |
| 5 | **ニューヨーク**（DE 登記） | `HUB-US` | 3 | 北米 |
| 6 | **サンティアゴ** | `HUB-SA` | 3 | 南米 |
| 7 | **オークランド** | `HUB-OCEANIA-NZ` | 2 trust / 5 Hub | 承継 trust · 大洋州 Hub |

```yaml
# 仮計画 — グローバル Regional Pool（Phase 5 後）
plan: provisional
quorum: { mode: k_of_n, k: 3 }
n: 7
hubs:
  - HUB-APAC-JP
  - HUB-ME
  - HUB-EU-FRA      # 最終系では除外
  - HUB-EU-EE
  - HUB-US
  - HUB-SA
  - HUB-OCEANIA-NZ
```

#### 7.A.2 仮計画 — 採用しない / 後回し

| 候補 | 判断（仮計画時点） |
|------|-------------------|
| **シンガポール** | 不採用 — 東京で APAC を足りる |
| **アムステルダム** | 不採用 — FRA + タリンで EU 代替 |
| **イスタンブール** | **Witness 外** — トランジット hub（TK）のみ |
| **アイルランド** | 未検討（最終系で採用） |
| **モロッコ** | 後回し |
| **マイアミ** | satellite のみ |
| **シドニー** | オークランドに差し替え · satellite 可 |

---

### 7.B 最終系（Final Target · 2026-07-06）

> **位置づけ:** §8 Wave · [`trusted-hubs-oorgos.org.yaml`](../../steward/platform/protocol/trusted-hubs-oorgos.org.yaml) `final_plan` · 運用移動（§10）の **正本**。

#### 7.B.1 グローバル 8 都市（最終系）

| # | 都市 | `hub_id` | Wave | 地域 | 主役 |
|---|------|----------|------|------|------|
| 1 | **東京** | `HUB-APAC-JP` | 1 | APAC | 薄い APAC · 国内寄付窓口 · 運営本部なし |
| 2 | **ドバイ**（DIFC） | `HUB-ME` | 1 | Middle East | ME Hub · substance · ME 地域財布 |
| 3 | **タリン** | `HUB-EU-EE` | 1 | EU / 統括 | **全拠点統括 · Treasury** · EU Hub |
| 4 | **ダブリン**（アイルランド） | `HUB-EU-IE` | 2 | EU / 大西洋 | **EU ネット Witness** · 英語圏 EU · wire コスト精算（**FRA の代替**） |
| 5 | **イスタンブール**（トルコ） | `HUB-TR-IST` | 3 | 欧亜接続 | **欧亜中継 Hub** · AF · 南米 · タリンへの接続 · Star Alliance（TK） |
| 6 | **ニューヨーク**（DE 登記） | `HUB-US` | 3 | 北米 | 北米 wire |
| 7 | **サンティアゴ** | `HUB-SA` | 3 | 南米 | 南半球南錐 |
| 8 | **オークランド** | `HUB-OCEANIA-NZ` | 2 trust / **5 Hub** | 大洋州 | Endowment trust · 大洋州 Witness |

```yaml
# 最終系 — グローバル Regional Pool（Phase 5 後）
plan: final
quorum: { mode: k_of_n, k: 3 }
n: 8
hubs:
  - HUB-APAC-JP
  - HUB-ME
  - HUB-EU-EE
  - HUB-EU-IE      # アイルランド（ダブリン）— FRA 代替
  - HUB-TR-IST     # トルコ（イスタンブール）— 仮計画では transit のみ
  - HUB-US
  - HUB-SA
  - HUB-OCEANIA-NZ
# n=8 · k=3 → 同時 5 台停止まで余裕
# 越境 Tier B/C 等で k=4 を pool ごとに上書き可
```

**本番最小（Wave 2 まで）:** n≥4 · k=3 — §3.1 不変。最終系でも Wave 2 完了時点で **n=4**（タリン · ドバイ · 東京 · ダブリン + peer）を gate。

#### 7.B.2 最終系 — フランクフルト除外 · IE/TR 採用の理由

| 変更 | 理由 |
|------|------|
| **フランクフルト除外** | EU Witness を **ダブリン（IE）** に集約 — 英語圏 · EU 法域 · 大西洋ケーブル landing · タリンとのデジタル連携 |
| **アイルランド（ダブリン）追加** | `HUB-EU-IE` — EU wire コストセンター（仮計画の FRA 役割を継承）· CLG / Ltd で substance |
| **トルコ（イスタンブール）追加** | `HUB-TR-IST` — 仮計画の **トランジット専用** から **Witness 昇格** · AF · 南米 · タリン · 中東の **1 乗継接続ハブ** · TK Star Alliance |

#### 7.B.3 最終系 — 採用しない / 後回し / satellite

| 候補 | 判断（最終系） |
|------|---------------|
| **フランクフルト** | **不採用** — 仮計画（§7.A）のみ · 最終系は `HUB-EU-IE` に置換 |
| **シンガポール** | 不採用 — 東京で APAC を足りる |
| **アムステルダム** | 不採用 — ダブリン + タリンで EU 代替 |
| **モロッコ** | 後回し — カイロ + ケーブルで代替 |
| **マイアミ** | satellite のみ — BR RTT 問題時 |
| **シドニー** | オークランド正 · ケーブル landing 時のみ satellite |

#### 7.B.4 仮計画 → 最終系 差分

| 項目 | 仮計画 §7.A | 最終系 §7.B |
|------|------------|------------|
| グローバル Hub 数 | 7 | **8** |
| EU ネット（Wave 2） | フランクフルト `HUB-EU-FRA` | **ダブリン `HUB-EU-IE`** |
| 欧亜接続 | イスタンブール = transit のみ | **イスタンブール `HUB-TR-IST` = Witness** |
| Phase 5 後 n | 7 | **8** |
| Wave 3 追加 | NY · SA | NY · SA · **IST** |
| AF プール | 同一（§7.C） | 同一（§7.C） |

---

### 7.C アフリカ Continental Pool（+3 · 両プラン共通）

グローバル pool（仮計画 n=7 / **最終系 n=8**）と **compose** 可能（quorum は pool ごと）。
| 拠点 | `hub_id`（例） | Wave | 東京アクセス | 主役 |
|------|----------------|------|-------------|------|
| **カイロ** | `HUB-AF-CAI` | 4 | **MS 直行**（アフリカ唯一） | スエズ chokepoint · 東京の AF 玄関 |
| **ジブチ** | `HUB-AF-DJ` | 4 | NRT–IST/DXB–JIB（1 乗継） | 東アフ landing 密度 |
| **南ア**（JNB/CPT/DBN） | `HUB-AF-ZA` | 4 | 同上 1 乗継 | 南端 · Umoja→豪州経路 |

```yaml
# アフリカ Continental Pool
quorum:
  mode: k_of_n
  k: 3
hubs:
  - HUB-AF-CAI
  - HUB-AF-DJ
  - HUB-AF-ZA
```

**運用上の注意:** Hub は landing / 認定 DC に置く。**カイロ Ramses 街中 DC 依存は禁止**。南アは治安 △ — 監査は短時間 + 現地パートナー。

---

## 8. 段階開設（Wave）とその年に置く法人の役割

**正本:** §7.B **最終系**（n=8）の Wave。**仮計画**（FRA · n=7）の Wave は §7.A および §8.A を参照。

各 Wave で **開設する都市** と **その年から負う法人の役割** を下表に固定する。法人は Witness ノード運営・資金留保・wire コスト精算の **いずれかまたは複数** を担うが、**OpenOrgOS Foundation（寄付本体）≠ 全 Hub 物理運営**（§2）。

### 8.1 Wave 一覧（最終系）

| Wave | 時期目安 | 開設拠点 | その Wave で成立させる pool / 法人 |
|------|----------|----------|-------------------------------------|
| **1** | 初期 | **タリン · ドバイ · 東京** | Treasury=タリン · ME=ドバイ · 東京=薄い APAC · peer と **n≥4 · k=3** |
| **2** | 次 | **ダブリン（IE）** · **オークランド（trust）** · **タリン Fund** | グローバル **n=4 · k=3** · trust · Fund |
| **3** | 次 | **NY · サンティアゴ · イスタンブール** | グローバル **n=7** |
| **4** | 次 | カイロ · ジブチ · 南ア | アフリカ pool **n=3 · k=3** |
| **5** | 需要時 | オークランド（Witness 本番） | グローバル **n=8 · k=3** · trust に Hub colocate |

**予算目安（存在維持）:** seed **~100 万円/chapter/年** · 本番 SLA **300〜500 万円/chapter/年**（タリン Treasury が配分決定）。

### 8.A Wave 一覧（仮計画 · 参照用）

| Wave | 開設拠点 | グローバル n |
|------|----------|-------------|
| 1 | タリン · ドバイ · 東京 | ≥4（peer 含む） |
| 2 | **フランクフルト** · オークランド trust · タリン Fund | 4 |
| 3 | NY · サンティアゴ | 6 |
| 5 | オークランド Hub | **7** |

### 8.2 Wave 別 — 法人形態と年次役割（最終系）

#### Wave 1（タリン · ドバイ · 東京）

| 拠点 | 法人形態（案） | その年からの役割 |
|------|---------------|-----------------|
| **タリン** | **OpenOrgOS OÜ**（e-Residency · Treasury） | **全拠点統括本部** · **お財布** — 各 chapter への OPEX/CAPEX/grant **配分を決定・実行** · grant ledger 正本 · `HUB-EU-EE` · 留保 0%（分配まで） |
| **ドバイ** | **DIFC FZCO**（タリン OÜ 子会社 or 姉妹） | `HUB-ME` · ME substance · **Treasury から配分された ME 地域財布** |
| **東京** | **認定 NPO**（寄付窓口のみ）+ **Hub 運営委託 GK**（資本金最小 · **タリンとの cost-only 請求**） | `HUB-APAC-JP` · 国内寄付受領 → **即時助成で海外へ** · **留保・運営本部・創業者の大株主ポジションなし** |

**Wave 1 の gate:** タリン OÜ が grant 正本 · ドバイ substance · 東京は APAC Hub + peer ≥2 で **k=3** · gossip L1。

**創業者（日本国籍）の Wave 1 ポジション:** タリン/ドバイの **直接大株主にしない** · 東京 NPO は **理事**（無報酬 or 薄報酬）· 実務は **タリン OÜ との業務委託**（日本側は源泉・所得のみ · 法人留保なし）。

#### Wave 2（ダブリン · オークランド trust · タリン Fund）

| 拠点 / 法人 | 法人形態（案） | その年からの役割 |
|-------------|---------------|-----------------|
| **ダブリン**（アイルランド） | **CLG** または **Ltd**（利益非留保 · **日本法人支店なし**） | `HUB-EU-IE` · EU Witness · 英語圏 EU wire · コストセンター · **OPEX はタリン Treasury から grant** |
| **オークランド** | **Endowment / 慈善 trust**（Charities Services） | **子 · 孫承継の正本** · タリン OÜ · **タリン Fund** · ドバイ FZCO **株主上位** |
| **タリン Fund** | **別 OÜ / AS**（Treasury と **口座・帳簿分離**） | **投資専用** · 投資委員会 · capital は Treasury から **ポリシーに基づく call のみ** |

**Wave 2 の gate:** グローバル **n=4 · k=3** · trust deed · OÜ + Fund 株式を trust へ移管 · Treasury 配分表初版 · Fund 投資ポリシー。

#### Wave 3（NY · サンティアゴ · イスタンブール）

| 拠点 | 法人形態（案） | その年からの役割 |
|------|---------------|-----------------|
| **NY**（登記 **デラウェア**） | DE **非営利連携** または薄い **LLC** | `HUB-US` · 北米 wire · 留保最小 |
| **サンティアゴ** | **SpA** 等 | `HUB-SA` · 南半球南錐 · 南米 Witness |
| **イスタンブール**（トルコ） | **Ltd Şti** 等（タリン OÜ から **Hub 運営委託** 可） | `HUB-TR-IST` · **欧亜中継 Witness** · AF · 南米 · タリン接続 · TK substance |

**Wave 3 の gate:** グローバル **n=7** · Star Alliance 直行網（§10）· IST が AF/SA/タリンへの **1 乗継接続** を Witness として提供。

#### Wave 4（カイロ · ジブチ · 南ア）

| 拠点 | 法人形態（案） | その年からの役割 |
|------|---------------|-----------------|
| **カイロ** | 現地最小法人 または **タリン/ドバイからの Hub 運営委託** | `HUB-AF-CAI` · AF pool アンカー · スエズ経路 · **助成金中心**（現地留保回避） |
| **ジブチ** | 同上 | `HUB-AF-DJ` · 東アフ landing · 委託運営 |
| **南ア** | 現地パートナー + 薄い法人 | `HUB-AF-ZA` · 南端 · 監査短時間 · 委託運営 |

**Wave 4 の gate:** AF pool **n=3 · k=3** · カイロ Ramses 非依存 · **IST Witness** または DXB 経由 1 乗継で全 AF Hub 到達可。

#### Wave 5（オークランド — Witness 本番）

| 拠点 | 法人形態（案） | その年からの役割 |
|------|---------------|-----------------|
| **オークランド** | Wave 2 の **同一 trust** に `HUB-OCEANIA-NZ` を colocate | 大洋州 Witness · **n=8 完成** |

**Wave 5 の gate:** グローバル **n=8 · k=3** · trust + Hub 同居。

### 8.3 法人レイヤの読み方（年を通じて）

| レイヤ | 担う拠点 | 年次の仕事 |
|--------|----------|-----------|
| **寄付本体** | OpenOrgOS Foundation（法人所在地は別途） | Core 仕様 · レジストリ · **Hub 物理運営は背負わない** |
| **統括本部 + お財布** | **タリン OÜ（Treasury）** | 全 chapter 配分決定 · grant · 契約 · **日本に置かない** |
| **投資ファンド** | **タリン Fund**（Wave 2〜） | 事業/戦略投資 · **chapter 配分とは口座分離** · 投資委員会 |
| **承継・株主上位** | **オークランド trust**（Wave 2〜） | タリン OÜ · **タリン Fund** · ドバイの支配 · 子孫 beneficiaries |
| **国内窓口（薄い）** | 東京 | APAC Hub · NPO 寄付 → **タリン Treasury** · cost-only 委託 |
| **ME 地域財布** | ドバイ | Treasury 配分の ME 留保 · substance |
| **Witness コストセンター** | IE · TR · NY · Santiago · Auckland Hub · AF 3 | digest · wire 精算 · **利益非留保** |
| **委託運営** | AF 3 · 東京 Hub GK | 上位 OÜ / trust から **Hub 運営委託** |

---

## 9. 法人・税務レイヤ（参考 · 非税務助言）

> **Disclaimer:** 下表はガバナンス設計の整理であり、税務・法務助言ではない。日本の相続税・贈与税は **世界財産課税** の対象になり得る。実設立前に **日本税理士 + 現地専門家** の確認が必要。

### 9.1 日本国籍創業者 — 税負担最小 · 子孫承継（設計原則）

| 原則 | 内容 |
|------|------|
| **運営本部を東京に置かない** | 全拠点配分 · grant 正本 = **タリン OÜ Treasury** · ME 地域財布 = **ドバイ** · 投資 = **タリン Fund（別）** |
| **日本法人で利益を残さない** | 東京 GK/NPO は **cost-only** · 黒字留保・役員賞与の蓄積を構造上禁止 |
| **直接大株主にしない** | 創業者個人がタリン/ドバイ OÜ の **特定支配株主** にならない — **株主 = オークランド trust**（Wave 2） |
| **CFC（特定外国関係会社）** | 日本居住者の過半数支配 + 実態不足 → 留保利益の日本課税。**substance + trust 上位保有** で設計 |
| **日本側の所得** | 業務委託報酬 · NPO 理事手当 · trust からの **計画分配** に限定 — 法人所得の二重構造を避ける |
| **子孫承継** | **オークランド trust deed** で子 · 孫を beneficiaries / 将来 trustee 候補 · 運営株式は個人相続させない |
| **分配タイミング** | 留保はタリン/NZ · 日本居住者への分配は **年度計画**（相続贈与税は別途シミュレーション） |

**ownership 目標形（Wave 2 完了後）:**

```yaml
succession:
  vehicle: OpenOrgOS Endowment Trust  # Auckland · Charities Services
  beneficiaries: [children, grandchildren]  # trust deed で定義
  holds:
    - Tallinn OÜ shares          # Treasury / HQ
    - Tallinn Fund shares        # 投資法人 · Treasury と別
    - Dubai FZCO shares_or_control
    - endowment_assets
founders_jp:
  roles:
    - contractor_to: Tallinn OÜ  # 業務委託 · 日本源泉
    - optional: Tokyo NPO 理事  # 無報酬推奨
  avoid:
    - majority_shareholder: [Tallinn OÜ, Dubai FZCO]
    - retained_earnings: Tokyo entities
```

### 9.2 拠点別レイヤ一覧

| 層 | 拠点 | 法人形態（案） | 税務上の位置づけ（案） | Witness / 資金役割 |
|----|------|---------------|----------------------|-------------------|
| 統括 + お財布 | **タリン** | OpenOrgOS **OÜ**（Treasury） | 留保 0%（分配まで）· 株主=NZ trust | **全 chapter 配分決定** · grant 正本 · EU Hub |
| 投資ファンド | **タリン** | OpenOrgOS **Fund OÜ/AS**（**Treasury と別法人**） | 投資収益 · エストニア fund 枠は要専門家 | 事業/戦略投資 · **Fund 口座** |
| 承継正本 | **オークランド** | Endowment trust | NZ: 相続税なし · 一般 CGT なし（参考） | OÜ + Fund + ドバイの株主上位 |
| 国内窓口 | 東京 | 認定 NPO + 薄い GK | 寄付控除 · **法人所得留保なし** | 寄付 → **タリン Treasury** · APAC Hub |
| ME 地域財布 | ドバイ | DIFC FZCO（QFZP） | 条件付 0% · substance 必須 | Treasury 配分 · ME Hub |
| EU ネット | **ダブリン**（IE） | CLG / Ltd | 利益非留保 · 日本支店なし | `HUB-EU-IE` · EU Witness |
| 欧亜接続 | **イスタンブール**（TR） | Ltd Şti 等 | 当地納税 · substance | `HUB-TR-IST` · 中継 Witness |
| 北米 | NY（DE 登記） | DE 非営利連携 / LLC | 留保最小 | US Hub · wire |
| 南米 | サンティアゴ | SpA | 年次法人税 · 留保最小 | SA Hub |
| アフリカ 3 | 各都市 | 最小法人 / 委託 | 現地留保回避 | AF pool · 助成中心 |

**日本 CFC 注意:** エストニア / UAE に **実態のない空壳** を置くと日本側課税。**DC · 契約 · 管理の substance 必須**。trust 上位保有でも **創業者の実質支配** が認定されれば CFC の対象になり得る — 専門家レビュー必須。

---

## 10. 運営移動 · トランジット方針（最終系 §7.B）

Witness Hub 間の **人的監査・鍵儀式** は Star Alliance 優先 · **乗継上限 1 回**。

### 10.1 直行（Star Alliance · Witness 拠点間）

東京 · **ダブリン** · ドバイ · **イスタンブール（TK）** · ニューヨーク · **カイロ** · オークランド（NZ90 / ANA NH7950 コードシェア等）

**仮計画との差分:** フランクフルトは最終系で **Witness 外**（§7.B.4）。イスタンブールは transit から **Witness 昇格**。

### 10.2 トランジット hub（Witness 外 · 運用のみ）

| ハブ | 用途 |
|------|------|
| **ドバイ** | 東アフ · 南ア · 中東二次接続（IST Witness 補完） |

**1 乗継で到達（Witness 経由）:** タリン · サンティアゴ · ジブチ · 南ア → **IST** または **DXB** 経由。

シンガポール · アムステルダム · **フランクフルト** · マイアミ · シドニーは **Witness 拠点ではない**（satellite / 廃止候補 · §7.B.3）。

### 10.3 ドメインと chapter の対応

| ドメイン | 役割 |
|----------|------|
| `openorgos.net` | グローバル入口 · Academy · 索引 |
| `oorgos.org` | レジストリ · ガバナンス · trusted-hubs |
| リージョン / chapter | 各国 · 地域の実行（上表の法人が operator） |

---

## 12. 関連文書

| 文書 | 内容 |
|------|------|
| [witness-hub-requirements.md](witness-hub-requirements.md) | FR · N-01–N-08 |
| [witness-hub-operations.md](witness-hub-operations.md) | デプロイ · バックアップ · CLI |
| [org-dissolution-witness-checklist.md](org-dissolution-witness-checklist.md) | 解散 export |
| [`witness-custody-handoff.template.yaml`](../../steward/platform/protocol/witness-custody-handoff.template.yaml) | 託し先マニフェスト |
| [`trusted-hubs-oorgos.org.yaml`](../../steward/platform/protocol/trusted-hubs-oorgos.org.yaml) | Regional Chapter レジストリ草案 |

---

## 13. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-25 | 初版 — Model Y · 運営 Org Hub · oorgos.org レジストリ |
| 2026-06-25 | k≥3 · n≥4 最小構成 · アンカー Hub コピー必須 |
| 2026-07-05 | **7 Hub + AF 3 都市選定確定** · Wave 別法人役割 · 税務レイヤ · トランジット方針 |
| 2026-07-05 | **税務・承継微修正** — 運営本部=タリン · 東京=薄い APAC · オークランド trust Wave 2 · §9.1 日本国籍創業者 |
| 2026-07-05 | **タリン二層** — OÜ=Treasury · 別法人 Fund=投資 · Wave 2 で Fund 設立 |
| 2026-07-06 | **仮計画 §7.A**（FRA · n=7）と **最終系 §7.B**（**IE · TR 追加 · FRA 除外 · n=8**）を書面化 |
