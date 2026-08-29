# AIA Workspace Isolation

**版:** 1.0 · **日付:** 2026-08-24  
**ADR:** [0040](../adr/0040-aia-parallel-runtime.md)  
**親:** [aia-parallel-runtime.md](aia-parallel-runtime.md)

## 目的

同時稼働する AIA 同士が **中間成果で混線せず**、Primary Folders（SSOT）を破壊的に並列更新しないための境界を定義する。

## パス

| 層 | パス | git | 用途 |
|----|------|-----|------|
| Run workspace | `tenants/{id}/scratch/aia-runs/{run_id}/` | ignore | 下書き · ツール出力 · 一時添付 |
| SSOT | `tenants/{id}/data/**` · 許可された `docs/**` | 追跡（L2 除く） | 確定データのみ |
| 要約 | `docs/reports/agent-summaries/` | 追跡 | 上行（Integration / Executive） |

`run_id` 形式（推奨）: `AIR-YYYYMMDD-HHMMSS-{short}` または UUID。

## 規則

1. **書込（Running 中）**  
   - 許可: 自 `run_id` workspace のみ（および Skill/CLI が明示した一時パス）。  
   - 禁止: 他 `run_id` の workspace 読取/書込。  
   - 禁止: Primary Folders への **並列直接 mutate**（複数 Running が同一 YAML を書くこと）。

2. **読取**  
   - 既存 Primary Folders + classification（L0–L3）に従う。  
   - 他 run の生ログ・プロンプト履歴を自プロンプトに載せない（クロストーク禁止）。

3. **SSOT 確定（Merging）**  
   - Skill/CLI + **CAS** または `yaml-atomic` 単一 writer。  
   - または Integration Agent 経由の merge（[integration-agent.md](integration-agent.md)）。  
   - 衝突時は `aia_cas_conflict` を数え、再試行または Failed。

4. **寿命 / GC**  
   - Done / Failed 後、または TTL（既定案 7 日）経過で workspace を削除可。  
   - SSOT に未マージの成果: 破棄、または `routing-queue` 残骸として残す（テナント方針）。実装はフラグで選択。

5. **Dispatch cwd**  
   - shell / agent runtime の作業ディレクトリはテナント配下。run 開始後は可能なら workspace を cwd とする（後続実装）。

## 単一 writer パターン

同一リソース（例: 1 つの `budget-delegation.yaml`）を触る複数 AIA が Queued している場合:

- **ドメイン CAS**（既存の revision トークン）で直列化、または  
- **担当 Agent のみ書込・他は message / WO**、または  
- **Integration が merge 窓口**

仕様上、どれか一つを run 計画（WO）に明示する。

## 関連

- [folder_access_policy.md](../../steward/rules/folder_access_policy.md)
- [aia-parallel-runtime.md](aia-parallel-runtime.md)
