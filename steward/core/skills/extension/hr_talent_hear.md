# Skill: hr_talent_hear

## 目的

仕事の回答から求人票を作る。年齢・性別は拒否する。

## 使用 Agent

Human Resources Agent · Recruiting Agent

## runtime

`cli`

## 方針

不足項目は自由記述を求めず、分かっている事実は選択肢・推奨付きで確認する。  
就業場所の駅・入館などは `recruiting_worksite_confirm` に委譲する。  
「女性を増やしたい」「20代がいい」は求人票に書かず、`recruiting_reach_proposal` で媒体を提案する。

## CLI

```bash
npm run orgos -- hr talent-hear --answers <file> --json
```
