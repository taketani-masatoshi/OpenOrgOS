# Japan Business Capability Catalog

**正本:** [business-capability-catalog.yaml](./business-capability-catalog.yaml)  
**Web 連携:** [business-capability-catalog.csv](./business-capability-catalog.csv)（同一内容 · フラット · UTF-8）

## 用途

日本国内でビジネスを推進する際に必要となる **Agent · Module · Skill** の要件 DB。実装は含まない — ロードマップ · ギャップ分析 · 外部 Web/API 取込用。

## ファイル形式

| ファイル | 用途 |
|---------|------|
| `.yaml` | 正本 · 階層構造 · `summary` · リレーション |
| `.csv` | スプレッドシート · BI · REST 取込（`entity_type` 列で agent/module/skill/category を区別） |

## CSV 列

`entity_type,id,name_ja,name_en,category_id,status,priority,agent_id,module_id,runtime,cli_command,tier,pack,regulations,official_urls,notes,path`

## status 値

| 値 | 意味 |
|----|------|
| `implemented` | コア skill/Agent として利用可能 |
| `partial` | activation_ready モジュール等 · 一部 CLI のみ |
| `planned` | 要件定義済 · 未実装 |

## 更新

```bash
# YAML 編集後 CSV 再生成
node --import tsx -e "
import { readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';
// …（pack README 内スクリプト参照 · または手動同期）
"
```

## 関連

- コア Agent: [steward/core/agents/registry.yaml](../../core/agents/registry.yaml)
- JP pack: [pack.manifest.yaml](./pack.manifest.yaml)
- モジュール readiness: [steward/modules/readiness.yaml](../../modules/readiness.yaml)
