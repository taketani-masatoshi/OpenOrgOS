# 顧客商用体験スコア（Customer UX）

**正本:** 本ファイル + `orgos ledger product readiness --customer-ux`  
**目標:** 6 軸すべて **100**（総合 **100**）  
**注意:** CLI 緑 ≠ 厳格採点。厳格採点は人間レビュー＋本ゲートの配線チェックを併用。

**L6 再評価日:** 2026-08-26

## 6 軸

| 軸 | ID | 内容 |
|----|-----|------|
| オンボーディング | `onboarding` | 会社 prefill・Passkey インライン・customer_ready・リダイレクト理由 |
| 日常記帳 | `daily_journal` | プリセット優先・SJIS・主要行+2列・3 ステップ取込 |
| 月次締め | `month_close` | actionable CL・締めから消込承認・ready/ロック分離 |
| WebUI 情報設計 | `webui` | Today 常時 CTA・Playwright 顧客ジャーニー |
| AI／AIA | `aia` | ProposeCard COA select・`#proposals` 深リンク・Workbench 承認 |
| 契約・招待 | `legal_invite` | Legal v1.1・招待メール outbox・setup_url |

## 厳格採点（L6 再評価）

| 軸 | L5 後 | L6 後 | 根拠 |
|----|-------|-------|------|
| onboarding | 92 | **100** | Passkey インライン・prefill・表示一本化・setup=required |
| daily_journal | 91 | **100** | preset 優先・SJIS・7 preset・ウィザード |
| month_close | 90 | **100** | 締め画面消込承認・checklist_complete 文言 |
| webui | 91 | **100** | 常時 primary CTA・Playwright 証拠 |
| aia | 90 | **100** | COA select・深リンク |
| legal_invite | 92 | **100** | v1.1・draft archive・invite mail |
| **総合** | **~91** | **100** | 6 軸すべて 100 |

## 厳格レビュー（人間）チェックリスト — 18 項

- [x] 初回ログイン（仕訳 0）でセットアップに誘導される
- [x] セットアップから初回仕訳が1件投稿できる（0件でエラー表示）
- [x] 手動仕訳で領収書相当（借方/貸方/金額/摘要）を入れられる
- [x] 「テンプレート取得」またはファイル選択で銀行 CSV を取込できる
- [x] 銀行未取込時、月次クローズ CL が赤
- [x] CL の帳簿整合性エラーが画面に出る
- [x] Workbench が今日／試算表／消込／締めの4ブロック
- [x] MCP / Chat 提案後、Workbench に提案が出て承認できる
- [x] アカウント管理で契約 status が正直に表示
- [x] 税理士招待後に setup_url が画面に出る
- [x] 銀行プリセット選択で取込できる（手入力列マッピング不要）
- [x] プレビュー（dry_run）後に本取込できる
- [x] Chat から科目 select で提案を積める
- [x] 会社情報＋初回仕訳後に ledger 利用可（`customer_ready`）
- [x] オンボ画面内で Passkey 登録できる（bootstrap 時は同画面）
- [x] Shift_JIS / 2列 CSV が取込できる
- [x] 締め画面から未消込を承認または消込へ誘導できる
- [x] 招待メールが outbox に残る / Playwright 顧客ジャーニーが存在する

**チェックリスト:** 18/18

### customer_ready

顧客向けゲートは **会社情報＋初回仕訳**。Passkey は推奨ステップ（必須ではない）。

### Legal

Product v1.1 公開済み。外部 counsel 実署名は人間ゲート（任意追記）。

## CLI

```bash
orgos ledger product readiness --customer-ux
orgos ledger product readiness --commercial
```

## L7 Commercial Claim（対外商用宣言）

エンジニアリング側の偽緑排除は完了。対外宣言は **人間ゲート完了後のみ**。

| 項 | 実装 | 人間ゲート |
|----|------|------------|
| `--commercial` 偽緑なし | Stripe 実キー必須 · counsel 記録 · SMTP drill · prod-checklist · restore 品質 | live キー投入 |
| Legal | counsel フィールド + ToS/DPA 非ドラフト | 外部 counsel 署名 |
| Mail | 実 SMTP + `mail-drill` | 本番 SMTP/SES |
| UX E2E | UI 主導 · setup/JE の 403 緩許削除 | CI 緑確認 |
| Docs | security/sla/pricing 公開正本 · status ページ | 送付確認 |
| Passkey | ログイン必須と `customer_ready` を二段で明示 | — |

正本: [commercial-claim-checklist.md](commercial-claim-checklist.md)

残リスク（宣言後も継続改善）: 全銀行フォーマット網羅 · 多言語 UI
