# Skill: recruiting_worksite_confirm

## 目的

短期求人の就業拠点を、調査候補 → 確認 → 選択肢 → 保存の順で確定する。  
ユーザーに自由記述させず、番号選択でキーボード入力を減らす。

## 使用 Agent

Recruiting Agent · Human Resources Agent

## runtime

`cli`

## 方針（キーボード削減）

1. 住所・建物名が分かったら Agent が Web 等で最寄り駅を調べ、候補を提示して確認する
2. 確定した駅・入館・受動喫煙の事実は `data/hr/worksites/` に保存し、次回同じ拠点では再利用する
3. タイミー等の必須区分（受動喫煙・業種）はカタログから選ばせる。自由記述しない
4. 電話番号など個情は拠点 YAML に書かない

## CLI

```bash
npm run orgos -- hr worksite-confirm --worksite <file> --json
npm run orgos -- hr worksite-confirm --worksite <file> \
  --passive-smoking indoor_smoke_free --job-category light_work --write <out> --json
```
