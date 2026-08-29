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
orgos iso audit run
orgos iso audit report
orgos compliance gap   # REG ギャップ + 統制ギャップ
```

---

## 関連

- ISO テンプレ: [../iso/00-このフォルダについて.md](../iso/00-このフォルダについて.md)
- 共通コアモジュール: [../iso/core/00-このフォルダについて.md](../iso/core/00-このフォルダについて.md)
- ADR 0067: `docs/adr/0067-iso-common-core-and-roadmap.md`
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
