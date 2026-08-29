# OrgOS Ledger — セキュリティ概要（顧客向け）

**版:** 1.0 · **対象:** 法人顧客の情報セキュリティ担当  
**地位:** 公開正本（顧客送付可）

---

## 1. データ分離

| 項目 | 内容 |
|------|------|
| モデル | **マネージド単一テナント** — 顧客データは専用 workspace に格納 |
| 他顧客との共有 | 同一プロセスでのマルチテナント混在なし |
| 正本 | ファイルベース YAML（仕訳 append-only） |

## 2. 認証・認可

| 項目 | 内容 |
|------|------|
| 認証 | WebAuthn / Passkey（FIDO2）— ログイン必須 |
| 認可 | `operators.yaml` RBAC（ceo / approver / operator / readonly） |
| 本番 | `STEWARD_CHAT_AUTH=1` · dev passkey 無効 · CSRF 有効 |
| 監査 | Chat 操作 JSONL · CLI mutation audit · 仕訳 `posted_by` / `posted_at` |

## 3. 改ざん防止（電子帳簿）

| 要件 | 実装 |
|------|------|
| 訂正・削除の履歴 | 仕訳は **append-only**。訂正は **逆仕訳** + `reversal_of` |
| 期間ロック | `period-locks.yaml` append-only。ロック月は新規仕訳拒否 |
| 検索 | 日付 · 金額 · 取引先 · 科目 · 摘要（`ledger dencho search` / API） |
| 整合性 | `orgos validate` · `orgos ledger dencho check` |
| 販売境界 | 基本要件対応。優良要件は別 SKU（[dencho-sales-claim.md](dencho-sales-claim.md)） |

## 4. 通信・保存

| 項目 | 内容 |
|------|------|
| 転送 | TLS 1.2+（HTTPS 必須） |
| 保存 | 顧客専用ボリューム · バックアップは運用 Runbook 参照 |
| 秘密情報 | L2 は vault 外出し可（`ORGOS_VAULT_ROOT`） |

## 5. サブプロセッサ

| 提供者 | 用途 |
|--------|------|
| ホスティング事業者 | VM / ディスク（自社または指定クラウド） |
| Stripe | サブスクリプション課金 |
| メール配送（SMTP / SES 等） | 招待・支払失敗通知 |

## 6. 開示・問合せ

セキュリティ問合せ: support@oorgos.org  
DPA: [legal/dpa.md](legal/dpa.md)  
障害告知: [status.md](status.md)
