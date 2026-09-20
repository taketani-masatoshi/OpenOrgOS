# Skill: recruiting_reach_proposal

## 目的

ユーザーが届いてほしい層（女性の応募を増やす、20代に届ける）を言ったとき、求人票には書かず、その層が見に来やすい媒体を提案する。

## 使用 Agent

Recruiting Agent

## runtime

`cli`

## 方針

- 法律に従う。求人票・選考条件に年齢・性別を書かない。来た人を年齢・性別では落とさない
- 拒否だけで終わらない。希望に近づく媒体を先に提案する
- 外部投稿と承認はしない

## CLI

```bash
npm run orgos -- hr talent-reach --wish "女子を取りたい" --json
```
