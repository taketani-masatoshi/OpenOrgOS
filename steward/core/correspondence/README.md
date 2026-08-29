# Correspondence style — core index

**目的:** 社外メールの品格・文化差を **ドキュメント正本** で担保し、Secretary / Mail Outbound / lint が同じ参照を使う。

## 解決順（受信者優先）

1. 連絡先の `correspondence_locale`（`external-contacts` / peer）
2. 相手国・言語ヒントから推定した locale
3. 自テナント jurisdiction の `locale`（例: JP → `ja-JP`）
4. 本ディレクトリの中立フォールバック（短文・事実のみ）

## 正本マップ

| 種別 | パス |
|------|------|
| **契約（全 locale）** | [style-contract.md](style-contract.md) |
| **日本語・1級相当** | [jurisdiction-packs/JP/correspondence/email-style-ja.md](../jurisdiction-packs/JP/correspondence/email-style-ja.md) |
| **JP 機械ルール** | [jurisdiction-packs/JP/correspondence/style.yaml](../jurisdiction-packs/JP/correspondence/style.yaml) |
| **JP 定型** | [jurisdiction-packs/JP/correspondence/templates/](../jurisdiction-packs/JP/correspondence/templates/) |
| **テナント上書き** | `tenants/{id}/rules/secretary_behavior.md` |
| **品質計画** | [docs/org-os/secretary-quality-uplift-plan.md](../../docs/org-os/secretary-quality-uplift-plan.md) |

## Agent 分担

| 主体 | 参照 |
|------|------|
| Secretary | 先読み・CEO ゲート・style 正本に沿った起案指示 |
| Mail Outbound | draft/send · **style lint 通過後**に送信可 |
| Venue Booking（将来） | 予約実行のみ。文案品格は Secretary + style 正本 |

## CLI

```bash
orgos mail outbound correspondence style resolve --contact-ref EXT-003
orgos mail outbound correspondence style lint --draft DRAFT-...
# legacy alias:
orgos secretary correspondence style lint --draft DRAFT-...
```
