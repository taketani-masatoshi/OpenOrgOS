# 第9期 税理士送付パッケージ

**株式会社MAL · 第9期（2026/2/1〜2027/1/31）**  
**送付準備日:** 2026-08-24 · **依頼先:** 税理士法人マルパートナーズ（山田健一）

---

## 1. 依頼概要

第8期締め（2026-01-31）および第9期申告準備について、社内再構成済みデータの **税務判断・確定** を依頼します。  
OrgOS 上の申告ギャップ 5 件（warning 4 · info 1）のうち、本パッケージで **4 件を税理士確認待ち** として整理しています。

---

## 2. 添付・参照一覧

| # | 資料 | Path | チェックリスト # |
|---|------|------|------------------|
| A | 税理士確認チェックリスト | [fy2026-tax-advisor-checklist.md](../fy2026-tax-advisor-checklist.md) | 1–10 |
| B | 第9期計算書類（暫定） | [fy2026-keisansyorui.md](../fy2026-keisansyorui.md) | 1–5 |
| C | 第8期計算書類（社内再構成） | [fy2025-keisansyorui.md](../fy2025-keisansyorui.md) | 3 |
| D | 税務プロファイル | `data/finance/tax-profile.yaml` | 10 |
| E | 申告ギャップ台帳 | `data/finance/tax-filing-gaps.yaml` | 全体 |
| F | 固定資産台帳 | `data/finance/fixed-assets.yaml` | 4 · 9 |
| G | 役員貸付 | `data/finance/loans.yaml` | 8 |
| H | 予実（第8期） | `data/plans/yojitsu-fy2025.yaml` | 5 |
| I | 予実（第9期） | `data/plans/yojitsu-fy2026.yaml` | — |
| J | 生成チェックリスト | `docs/finance/tax-filing-checklist.md` | — |

---

## 3. ギャップ ↔ 依頼項目対応表

| gap id |  severity | 依頼 # | 社内ステータス | 税理士への質問 |
|--------|----------|--------|----------------|----------------|
| `fy2025-bank-balance-proof` | warning | 2 | **deferred** — 送付待ち | 第8期末（2026-01-31）全口座残高証明と社内試算 13,853,191円の突合 |
| `fy2025-corp-tax-finalize` | warning | 5 | **deferred** | 第8期法人税等 127,021円（概算）の確定 |
| `fy2025-imputed-interest` | warning | 8 | **deferred** | LOAN-001/002 金利0%のみなし利息処理方針 |
| `fy2026-invoice-exempt-reconcile` | warning | 10 | **deferred** — 暫定 basis 記録済 | 免税 × T4010001189530 の整合・第9期区分確定 |
| `fy2025-cip-evidence` | info | 9 | **resolved** — 社内 | 亀沢建物 ASSET-003 · 取得 2026-04-01 · 供用 2027-02 · 税理士確認のみ |
| `fy2025-retained-earnings-bridge` | info | 3 | **deferred** | 繰越 500万円接続の税理士突合 |

---

## 4. 社内暫定見解（税理士確認用）

### 消費税（#10）

- 第9期売上高想定: **750万円**（`tax-profile.consumption_tax.base_period_sales_jpy`）
- 基準期間閾値: 1,000万円未満 → **免税事業者** を暫定選択
- インボイス登録: **T4010001189530**（取引先表示義務対応）
- 暫定根拠: `tax-profile.consumption_tax.invoice_exempt_reconciled_basis`

### 減価償却（#4 · #9）

| 資産 | 取得 | 年間償却 | 第9期 P/L |
|------|------|---------:|----------:|
| ASSET-001 番町 | 2025-02 | 353,191 | 353,191 計上 |
| ASSET-003 亀沢建物 | 2026-04 | 764,705 | **0**（供用 2027-02） |

### 役員貸付（#8）

- LOAN-001: 1,660万 · LOAN-002: 9,600万 · 金利 0%
- みなし利息・科目処理: **未確定**（税理士判断待ち）

---

## 5. 送付メール下書き

```
件名: 【株式会社MAL】第9期 税務確認依頼（チェックリスト10項目）

山田先生

お世話になっております。株式会社MAL の第9期（2026/2/1〜2027/1/31）申告準備について、
社内データ整備が完了しましたのでご確認をお願いいたします。

添付・共有:
・税理士確認チェックリスト（10項目）
・第8期・第9期計算書類（暫定）
・固定資産台帳・役員貸付一覧

特にご確認いただきたい点:
1. 第8期末銀行残高と社内試算（13,853,191円）の突合
2. 消費税区分（免税 × インボイス登録済）の確定
3. 亀沢建物の減価償却開始時期（供用 2027-02 想定）
4. 役員貸付 0%金利の税務処理

ご多忙のところ恐れ入りますが、初回ご回答可能な目安をお知らせください。

株式会社MAL
```

---

## 6. 税理士回答後の OrgOS 更新手順

```bash
ORGOS_TENANT=mal orgos tax gap resolve --id fy2025-bank-balance-proof --status resolved --notes "税理士確認 2026-..."
ORGOS_TENANT=mal orgos validate
# 1. tax-profile.yaml · yojitsu · keisansyorui を確定値で更新
ORGOS_TENANT=mal orgos skills run tax-filing-prep
ORGOS_TENANT=mal orgos tax readiness   # filing_ready 目標
ORGOS_TENANT=mal orgos tax gaps
```

**初回送付:**

```bash
ORGOS_TENANT=mal orgos tax handoff
# → correspondence draft 作成 · org approval approve → mail send
```

---

## 7. 関連

- [executive-remaining-tasks.md](../executive-remaining-tasks.md) — P0 税務タスク
- [tax/fy2026-tax-readiness-assessment.md](fy2026-tax-readiness-assessment.md)
- ADR [0051-jp-tax-skills-cli-only.md](../../../../docs/adr/0051-jp-tax-skills-cli-only.md)
