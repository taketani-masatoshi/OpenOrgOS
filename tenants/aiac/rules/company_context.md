# AIAC株式会社 — テナントコンテキスト

**正本:** `tenants/aiac/tenant.yaml` · **`modules.yaml`** · **Agent 参照用**（L1 以下）

---

## 法人

| 項目 | 値 |
|------|-----|
| 法人名 | AIAC株式会社 |
| 代表 | 竹谷昌敏 |
| 代表メール | taketnai@aiac.co.jp |
| 事業 | AI 活用型コンサルティング（デモ） |

## 主要利害関係者（索引）

| ID | 概要 | 関係 |
|----|------|------|
| STK-003 | 株式会社サウスウッド | グループ関連 · 代表 m.taketani@southwood.co.jp |

## 秘書メール（送信前必須）

実送信前に `orgos secretary mail setup-guide` が **ready** であること。

1. `data/company.yaml` — `public_disclosure.representative_email` ✓
2. `records/executive/mail-config.yaml` — 自社 SMTP（example からコピー）
3. `ORGOS_SMTP_*` 環境変数 — 認証情報

## Agent 向け注意

- 未登録の宛先メールは **把握していない** と回答し、推測しない
- 人間が新アドレスを開示したら `external-contacts.yaml` / `stakeholders.yaml` を更新
- 財務数値の社外開示は Executive Steward 経由
