# Skill: recruiting_platform_listings

## 目的

3〜6ヶ月の業務委託を、Workship・複業クラウド・クラウドワークス/ランサーズ・ITエージェント向けの掲載文に整える。外部投稿と承認はしない。

## 使用 Agent

Recruiting Agent

## runtime

`cli`

## 方針

- 掲載文は日常の指揮命令を書かない（準委任または請負）
- 契約は初回3ヶ月、最長3または6ヶ月。更新は3ヶ月単位
- 月額は入力値のみ。時給から計算しない
- 月間稼働帯・職種・働き方は選択肢
- 毎日の指揮が必要、または本文に指揮命令があるときは、この4媒体には出さず有期雇用へ切り替える
- エンジニア以外は、対象外の媒体を `not_applicable` にする（無理に載せない）

## CLI

```bash
npm run orgos -- hr talent-platforms --facts <file> --json
```
