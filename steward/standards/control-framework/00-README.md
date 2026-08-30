# 統制フレームワーク — ISO × 社内規程 × Agent

**ゾーン:** フレームワーク定義 · **対象:** 全テナント共通の統制 ID・成熟度・Agent オーナーシップ。

ISO 条項を **統制テンプレート（CTL）** として機械可読化し、社内規程（REG）・証拠パス・担当 Agent を結ぶ。テナント固有の成熟度は `tenants/{id}/data/compliance/controls.yaml` に置く。

---

## 統制 ID

| 形式 | 例 | 用途 |
|------|-----|------|
| `CTL-CORE-{work}` | `CTL-CORE-internal-audit` | 複数 ISO に共通する**仕事**の統制 |
| `CTL-{ISO}-{clause}` | `CTL-13485-7.3` | その規格にしかない領域統制 |

条項番号は改定で動くため、共通統制は **仕事の型**（`work`）をキーにする。各規格パックは
`core_bindings` で自分の条項番号をコアに結ぶ（内部監査は Annex SL 9.2 / ISO 13485 8.2.4）。

コア統制の `supersedes` に旧 ID を列挙し、`orgos controls migrate-core` がテナントの
成熟度を引き継いだうえで旧 ID を畳む。

### 証拠の満たし方（`evidence_mode`）

| 値 | 意味 |
|----|------|
| `any`（既定） | 証拠パスが1つ存在すればよい（監査計画 · MR 議事録） |
| `all` | 有効な規格ごとの証拠が全て要る（リスク登録 · 方針 · スコープ） |

`all` があるため、統制を1件に畳んでも「27001 のリスク登録はあるが 9001 のものが無い」
というギャップが隠れない。

---

## 正本の分離

| 層 | パス |
|----|------|
| 成熟度定義 | [maturity-model.yaml](maturity-model.yaml) |
| Agent オーナーシップ | [agent-roles.yaml](agent-roles.yaml) |
| 共通コア統制 | `steward/standards/iso/core/control-map.yaml` |
| コア紐付けプロファイル | `steward/standards/iso/core/profiles.yaml` |
| ISO 条項マップ | `steward/standards/iso/ISO-XXXX/control-map.yaml` |
| ISO カタログ（status 含む） | `steward/standards/iso/catalog.yaml` |
| 法域 REG バインディング | `steward/jurisdiction-packs/{code}/control-framework/reg-bindings.yaml` |
| テナント状態 | `tenants/{id}/data/compliance/controls.yaml` |

---

## 成熟度（L0–L4）

| Level | 意味 |
|-------|------|
| L0 | 未検討 |
| L1 | 方針ドラフト |
| L2 | 方針承認・記録運用開始 |
| L3 | 内部監査・MR 実施記録 |
| L4 | 認証機関審査・登録 |

---

## CLI

```bash
orgos controls list [--iso ISO-9001] [--agent compliance]
orgos controls status
orgos controls gap
orgos controls for-agent compliance
orgos controls set --id CTL-9001-4.3 --maturity L2
orgos controls init
orgos controls migrate-core [--write]   # 旧 ID をコア統制へ畳む（既定 dry-run）
orgos iso catalog [--status available|coming_soon]
orgos iso roadmap [--tier 1|2|3|4]
orgos iso maps verify
orgos iso scaffold ISO-42001 [--dry-run]
orgos iso records check [--iso ISO-21401] [--strict]   # 記録の内容が仕様を満たすか
orgos iso requirements [--iso ISO-21401] [--unverified] # 要求事項と統制の被覆（双方向）
orgos iso audit run                                     # 適合性の事前検査（内部監査ではない）
orgos iso audit report
orgos compliance gap   # REG ギャップ + 統制ギャップ
```

内部監査（ISO 19011）は別系統:

```bash
orgos iso audit eligibility --iso ISO-21401 --auditor OP-00X
orgos iso audit plan create --iso ISO-21401 --auditor OP-00X --period 2026-09..2027-08
orgos iso audit finding set --plan IAP-001 --req REQ-21401-6.1-a \
    --verdict conform --evidence <path> --sample "..." --note "..."
orgos iso audit conclude --plan IAP-001 --summary "..."
orgos iso audit sign --plan IAP-001          # ceo/approver の人間セッションのみ
orgos iso audit programme --iso ISO-21401 --months 12
```

---

## 関連

- ISO テンプレ: [../iso/00-このフォルダについて.md](../iso/00-このフォルダについて.md)
- 共通コアモジュール: [../iso/core/00-このフォルダについて.md](../iso/core/00-このフォルダについて.md)
- ADR 0067: `docs/adr/0067-iso-common-core-and-roadmap.md`
- ADR 0068: `docs/adr/0068-iso-conformity-depth.md` — 記録内容 · 要求事項 · ISO 19011 · 署名
- Compliance Agent: [../../core/agents/compliance_agent.md](../../core/agents/compliance_agent.md)
- Internal Audit Agent: [../../core/agents/internal_audit_agent.md](../../core/agents/internal_audit_agent.md)

---

## 着手順序（priority）

各統制は `priority` を宣言する。規格を有効化した直後はほぼ全項目が未達になり、
横並びの不適合一覧では判断できないため、パック側が順序を持つ。

| 値 | 意味 |
|----|------|
| `P1` | 人の安全・法令上の要求。待てない |
| `P2` | 他の統制が依存する土台 |
| `P3` | 改善・報告 |

`orgos iso audit run` の改善提案は P1 → P3 の順に並ぶ。

## 証拠の実在性

`evidence_paths` は存在確認だけでは足りない。空の様式を証拠として数えると、
様式を配った時点で統制が適合に転じてしまう。

| 種別 | 充足条件 |
|------|---------|
| CSV | ヘッダ行に加えてデータ行が1件以上 |
| Markdown | `{PLACEHOLDER}` が残っていない |
| ディレクトリ | パターンに一致するファイルが存在 |

ギャップの `detail` は「未作成」「様式が未記入」「記録なし」を区別して示す。

## 条項番号の検証

`iso_refs` / `core_bindings` の `verified_on` · `verified_by` は、購入した規格票と
突合したときに記入する。未記入は「未検証」を意味し、`orgos iso clauses` で一覧できる。


---

## 記録の内容検査（`records.yaml`）

証拠ファイルが「ある」ことと、その記録が要求事項を満たすことは別である。
パックは `steward/standards/iso/<ID>/records.yaml` で記録ごとの仕様を宣言し、
`orgos iso records check` と `orgos validate` が検査する。

ルール語彙は **閉じている**（`schemas/iso-record-spec.ts` の discriminated union）。
式言語は作らない。語彙で表現できない適合性は監査員の判断であり、
内部監査の所見（`orgos iso audit finding set`）に記録する。

| ルール | 例 |
|--------|-----|
| `computed` | `score = severity × frequency` の一致 |
| `conditional_required` | `significant=yes` なら `control` と `objective` が必須 |
| `comparison` | `local_spend_yen <= total_spend_yen` |
| `freshness` | `reviewed_on` が365日以内 |
| `unique` · `non_empty` | ID / 月の重複禁止 · 空の登録簿は証拠ではない |
| `required_sections` · `no_placeholders` | Markdown 様式の必須見出し · 未置換 |

不備のある記録は `gap_type: record_invalid` として出る（`doc_missing` とは区別する）。

出口は2つあり、役割が違う。`orgos validate` は整合性ゲートなので記録の不備を
**warning** で出す（様式を配っただけのテナントで commit を止めない）。
適合性のゲートは `orgos iso records check --strict` で、不備があれば終了コード 1 を返す。

---

## 要求事項レジスタ（`requirements.yaml`）

統制より細かい単位。統制が箇条単位でしか要求に対応していないと、
箇条内の個々の shall が落ちていても見えない。被覆は**双方向**に検査する。

- `uncovered` — 統制が紐づいていない要求事項
- `orphan_controls` — どの要求事項にも紐づかない統制（規格に辿れない）
- `dangling` — 実在しない統制を参照している要求事項
- `unverified` — `verified_on` 未記入（規格票と未突合）

**ISO 本文は再配布できない。** `statement` は言い換えであり、突合するまで
被覆検査は「規格への網羅性」ではなく「想定した要求事項への網羅性」を示す。

---

## 内部監査（ISO 19011）

`orgos iso audit run` は**適合性の事前検査**であって内部監査ではない。
要求事項ごとの判定は人間の監査員が行い、CLI は判定・根拠・サンプルを記録する。
**LLM は判定に関与しない。**

`conclude` は全要求事項に判定があることを要求し、未判定があれば拒否する。
署名は既存の org approval（`subject_type: iso.internal_audit.signoff`）を通し、
署名後に所見を書き換えると digest 照合が落ちる。

### auditor 席の設定手順

内部監査を回すには `auditor` ロールの operator を1席立てる。

```yaml
# tenants/{id}/data/org/operators.yaml
- operator_id: OP-AUD-001
  display_name: 内部監査員
  role: auditor              # 既定権限に audit:read · audit:sign
  status: active
  person_id: EMP-00X         # 力量（CMP-10）の評価と突き合わせる
  allowed_agents: []         # 監査対象の統制を担当する agent を入れない
```

1. `data/hr/competence.yaml` に `CMP-10`（内部監査の実施）を置き、その席の評価を記入する
2. `orgos iso audit eligibility --iso <ID> --auditor OP-AUD-001` で独立性と力量を確認する
3. `orgos iso audit plan create` — 不適格なら拒否される（`--force` で記録は残せるが黙って通ることはない）

`allowed_agents` が監査範囲の統制の担当 agent と交差すると、自らの業務を監査することになるため拒否する。
ただし `internal_audit` agent 自体は除外している（全パックが内部監査の統制を持つため、
除外しないと適格な監査員がいなくなる）。監査プログラム自体の妥当性は
マネジメントレビューと外部審査に委ねられ、本検査では担保しない。
