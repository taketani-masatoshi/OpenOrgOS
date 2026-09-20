# Skill: recruiting_engagement_discuss

## 目的

仕事の事実（指揮命令・期間の定め・成果物かどうか）から、契約形態の候補と理由を決定論で返す。形態の最終決定・承認・解雇はしない。

## 使用 Agent

Recruiting Agent

## runtime

`cli` — LLM 不要。エージェントは結果の説明だけを行う。

## CLI

```bash
npm run orgos -- hr talent-discuss --answers <file> --json
```

## 入力

- `company_directs`: 会社が指揮命令するか
- `fixed_term_days`: 期間の日数。無い場合は `null`
- `deliverable_only`: 成果物納品だけで指揮しないか

## 出力

- `recommended`: `contractor` | `fixed_term` | `regular`
- `options`: 各形態の理由。`regular` は `requires_prerequisites: true`
- 不足時は質問のみ。年齢・性別は拒否

## 禁止

- 契約形態の決定
- 承認の実行
- 解雇・雇止め・委託終了の実行
- 解雇手順の本文の生成
