# Skill: correspondence_draft（対外連絡下書き · 承認起案）

**runtime:** cli · **Agent:** Mail Outbound のみ

## 目的

社外メール / Slack 通知の **下書き作成** と `org approval` への **承認起案**。送信は行わない。

## CLI

```bash
npm run orgos -- mail outbound correspondence draft \
  --channel email \
  --to "partner@example.com" \
  --subject "打合せのご調整" \
  --body "本文..."

# 後方互換
npm run orgos -- secretary correspondence draft ...
```

Skill 経由:

```bash
npm run orgos -- skills run correspondence-draft \
  --to "partner@example.com" --subject "件名" --body "本文"
```

## 出力

| 種別 | パス |
|------|------|
| 下書き YAML | `docs/executive/correspondence-drafts/DRAFT-*.yaml`（gitignore） |
| 下書き MD | 同フォルダ `DRAFT-*.md` |
| 承認 | `data/org/pending-approvals.yaml` · `subject_type: correspondence.email` |

## ワークフロー

1. **宛先照合** — `external-contacts.yaml` / `stakeholders.yaml`。未登録なら下書きを作らず「把握していません」と報告
2. Mail Outbound が下書き + `proposeOrgApproval`（`pending_approval`）— **既定で CEO 等を CC**
3. **人間が文案を確認** — `mail outbound correspondence show --id DRAFT-...` または `DRAFT-*.md`
4. 人間が `org approval approve --id APR-... --approver "CEO" --reviewed`（`--reviewed` 必須）
5. `correspondence_send` / `slack_notify` で送信（**ceo/approver · operator 認証必須**）

`--contact-ref EXT-...` 使用時は正本の `email` を `--to` に反映する。人間が新アドレスを開示した場合は **先に正本を更新** してから下書きを作成する。

### 既定 CC（Secretary 送信元 → 外部）

秘書アドレス（`records/executive/mail-config.yaml` の `from`）で社外へ送るとき、CEO 等の oversight 宛先を **自動 CC** する。

| 優先 | 正本 |
|------|------|
| 1 | `mail-config.yaml` → `outbound.cc_defaults` |
| 2 | `company.yaml` → `public_disclosure.correspondence_cc` |
| 3 | `company.yaml` → `public_disclosure.contact_email` |

除外: `to` · `from` と同一アドレス · `--no-cc-defaults` で無効化

## 禁止

- 承認前の `correspondence send`
- **正本にないメールアドレスへの宛先設定**（推測・捏造）
- 財務 YAML 参照 · L2 値の tracked MD 転記
