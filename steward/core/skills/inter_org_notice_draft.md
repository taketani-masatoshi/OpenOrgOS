# Skill: inter_org_notice_draft

**English:** Draft inter-org execution notices for human approval — **never transmit**.  
**日本語:** 組織間 wire の **起案下書き**（Secretary · オペレータ）。送信は CEO 等の `notice approve` のみ。

---

## 境界（必須）

| 可 | 不可 |
|----|------|
| `protocol notice draft` で起案 | `notice approve`（承認者のみ） |
| peer · contract **ID** の参照 | 契約本文 · 口座 · L2 値の wire |
| `data/org/pending-approvals.yaml` 確認 | Steward Agent による cross-org 送信 |

**Parent:** [inter-org-operator-model.md](../../../docs/org-os/inter-org-operator-model.md)

---

## ワークフロー

1. 契約が `executed` であることを Contract / 人間が確認済みとする
2. Secretary が下書き:

```bash
npm run steward -- --tenant <id> protocol notice draft \
  --peer PEER-001 --contract CTR-012 \
  --message "契約通りの運用を開始します（L1）"
```

3. 承認者一覧（wire-governance · `protocol approvers`）:

```bash
npm run steward -- --tenant <id> protocol approvers
```

4. CEO / 代表取締役が approve（Secretary は実行しない）:

```bash
npm run steward -- --tenant <id> protocol notice approve \
  --id NOTICE-* --approver "段燕燕"
```

5. 相手 Org が webhook ingest · ack draft → approve

---

## ack（受諾）起案

```bash
npm run steward -- --tenant <id> protocol notice draft \
  --type obligation.acknowledged \
  --peer PEER-002 \
  --correlation-event <inbound-event-id>
```

---

## 関連 CLI

| コマンド | 用途 |
|----------|------|
| `protocol notice list` | 承認待ち確認 |
| `protocol signing export-public` | 自社公開鍵（peer 登録用） |
| `protocol peer register --identity-file …` | 相手公開鍵登録 |
| `protocol deliver --peer … --file …` | envelope HTTP 配送 |
