# QR 付き適格請求書（receipt-qr）

**版:** 1.1 · **日付:** 2026-08-24  
**スキーマ:** `orgos.jp.receipt.v1` · **リンク:** `v2z`（deflate + base64url フラグメント）

## 目的

組織が **署名付き QR 領収書（適格請求書 / 適格簡易請求書）** を発行し、請求側 Org が取込 → Wire claim → 社内経費精算承認までを決定論でつなぐ。

## 署名規約

```
digest = SHA-256(canonicalJson(receipt))
signature = Ed25519.sign(digest_hex_bytes, protocol_private_key)
issuer_public_key = SPKI DER (base64)
```

- canonical JSON: `src/lib/protocol/canonical.ts`（キーソート）
- 鍵: Wire プロトコル鍵（`ensureProtocolSigningKey`）

## リンク形式

```
https://receipt.oorgos.org/r#v2z.{deflate(compact_json)}
```

公開 verify ポータル（OS_Community `sites/receipt/`）はフラグメントのみをブラウザ内で復号・検証する（サーバー非送信）。ja/en 切替あり。

### 任意 `fetch_url`

コンパクト JSON に `f` / 展開後 `fetch_url` がある場合、検証時に **オンライン本体を再取得**してから digest を確認する（オフライン断片よりサーバ正本を優先）。取得失敗時はローカル断片で継続可否を呼び出し側が判断。

## 発行フロー

1. `orgos receipt init --claim-base-url https://host/wire/v1/receipts/claim`
2. `orgos receipt issue --file input.yaml [--pdf out.pdf]`
3. Steward Chat「領収書発行」UI（`/?receipt-issue=1`）でも同処理（`POST /chat/v1/receipts/issue`）
4. デモ seed: `scripts/seed-receipt-qr-demo.ts`

### 発行者（手入力禁止）

発行者名・T番号は **テナントの法人番号からサーバ側で一意に決定**する（UI·API ともクライアント指定を無視）。

```
Google ID → operators.yaml → ORGOS_TENANT
  → data/company.yaml (name, corporate_number)
  → T番号 = tax-profile / `T` + corporate_number（一致必須）
```

`GET /chat/v1/receipts/issuer` で読み取り専用表示。宛名・明細・取引日のみユーザ入力。

正本:

| パス | 内容 |
|------|------|
| `data/receipt-qr/config.yaml` | claim_base_url / portal / 税丸め |
| `data/receipt-qr/receipts.yaml` | レジストリ（claim_key は hash のみ） |
| `data/receipt-qr/issued/{id}.json` | 署名付きペイロード（PDF 再生成用） |

## Wire claim（ADR 0032）

請求側が `steward.receipt.claim.requested` を **amount-free**（`receipt_id` / `digest` / `claim_key` のみ）で発行元へ POST。

| 側 | 入口 |
|----|------|
| 発行元受信 | `POST /wire/v1/receipts/claim` |
| 発行元承認 UI | Steward Chat `/?receipt=1` |
| 請求側取込 | `POST /chat/v1/org/budget/expense-claim/ingest` |

**防御（受信）:** payload に `amount` / `total_amount` / `lines` / `tax_totals` 等が含まれていれば **422 `amount_fields_forbidden`**。

**送信:** HTTPS 必須（localhost デモのみ HTTP 可）。経費取込時は **best-effort** Wire claim（失敗は notes · 金額正本はローカル snapshot）。

証跡 YAML から `claim_key` は除去する（漏洩防止）。

## 社内経費精算（REG-004 / REG-005）

詳細正本: [expense-claim-spec.md](expense-claim-spec.md)。

## CLI

```bash
orgos receipt init --claim-base-url http://127.0.0.1:8787/wire/v1/receipts/claim
orgos receipt issue --file ./scratch/receipt-issue.yaml --pdf ./scratch/out.pdf
orgos receipt list
orgos receipt verify '<link-or-file>'
```

## 関連

- [ADR 0032](../adr/0032-amount-free-receipt-wire-claim.md)
- [expense-claim-spec.md](expense-claim-spec.md)
- `schemas/receipt-qr.ts` · `src/lib/receipt-qr.ts` · `src/lib/receipt-pdf.ts`
