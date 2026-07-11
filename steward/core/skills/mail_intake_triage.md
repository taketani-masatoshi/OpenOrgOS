# Skill: mail_intake_triage（受信メール分類 · 決定論）

**runtime:** cli · **Agent:** Mail Intake のみ

## 目的

`records/executive/mail-received/*.eml` をルールベースで分類し、`data/executive/mail-triage-queue.yaml` に登録する。送信・承認は行わない。

## CLI

```bash
npm run orgos -- mail intake sync
npm run orgos -- mail intake triage
npm run orgos -- mail intake list --unprocessed
```

Skill 経由:

```bash
npm run orgos -- skills run mail-intake-triage
```

## 分類軸

| 軸 | 値 |
|----|-----|
| importance | p0 · p1 · p2 · p3 |
| urgency | immediate · today · week · none |
| disposition | ham · spam · suspicious · unknown |
| routing | secretary · archive · ignore |

## ルール正本

- コア: `steward/core/correspondence/mail-triage-rules.yaml`
- テナント上書き（任意）: `data/correspondence/mail-triage-rules.yaml`

## 出力

| 種別 | パス |
|------|------|
| トリアージキュー | `data/executive/mail-triage-queue.yaml`（L1） |
| 受信 .eml | `records/executive/mail-received/`（L2） |

## Secretary 連携

`routing=secretary` かつ `handoff_status=pending` のエントリは:

```bash
npm run orgos -- mail intake handoff --id MSG-...
```

で `docs/executive/correspondence-drafts/inbound-MSG-....md` を生成し **Mail Outbound** に渡す。
