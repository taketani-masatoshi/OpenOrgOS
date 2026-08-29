# 取締役会 電子署名のご案内（2026年7月15日）

**株式会社MAL**  
**議題:** 組織情報システム規程の制定及び社内規程の改定  
**議事録:** [fy2026-torishimari-gijiroku-regulations-orgos-20260715.md](./fy2026-torishimari-gijiroku-regulations-orgos-20260715.md)  
**会社イベント:** `EVT-20260715-meeting-board-regulations-orgos`

---

## 採用チャネル

| 系統 | 内容 | 本議事録 |
|------|------|----------|
| **C · `org-sign`** | 組織 Ed25519 シール · PDF digest + `.orgsign.json` | **採用（完了）** |
| B · DigiDoc | 国家 eID（カード） | 未採用（SiVa / サイドカー未整備） |
| 手書き押印 | 紙 | 不要 |

法的主張: **組織シールのみ**（国家 eID / eIDAS QES / 電子署名法認定は主張しない）。ADR 0018。

---

## 成果物

| ファイル | 役割 |
|---------|------|
| `artifacts/2026-07/EVT-20260715-meeting-board-regulations-orgos/fy2026-torishimari-gijiroku-regulations-orgos-20260715.pdf` | 正本 PDF |
| 同名 `.orgsign.json` | 切り離し検証マニフェスト |
| 案件 `OS-2026-002` | 台帳: `data/org-pdf-sign/cases.yaml`（`OS-2026-001` は void） |

秘密鍵は `data/org-signing/signing-key.pem`（**L2 · チャット禁止**）。

---

## 再発行手順（PDF を直したとき）

```bash
cd /Users/kk/OS_Steward

# 1. HTML → PDF（Chrome）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$(pwd)/tenants/mal/docs/company/artifacts/2026-07/EVT-20260715-meeting-board-regulations-orgos/fy2026-torishimari-gijiroku-regulations-orgos-20260715.pdf" \
  "file://$(pwd)/tenants/mal/docs/company/fy2026-torishimari-gijiroku-regulations-orgos-20260715.html"

# 2. 旧案件を void（任意）→ 新規 create / freeze / sign
npm run orgos -- --tenant mal operations org-sign void --id OS-2026-001 --reason "minutes text updated"
npm run orgos -- --tenant mal operations org-sign create \
  --pdf tenants/mal/docs/company/artifacts/2026-07/EVT-20260715-meeting-board-regulations-orgos/fy2026-torishimari-gijiroku-regulations-orgos-20260715.pdf \
  --title "取締役会議事録 2026-07-15 規程制定・改定" \
  --notes "EVT-20260715-meeting-board-regulations-orgos"
npm run orgos -- --tenant mal operations org-sign freeze --id OS-…
npm run orgos -- --tenant mal operations org-sign sign --id OS-…
npm run orgos -- --tenant mal operations org-sign verify --id OS-…
```

---

## 検証（いつでも）

```bash
npm run orgos -- --tenant mal operations org-sign verify --id OS-2026-002
# またはオフライン
npm run orgos -- --tenant mal operations org-sign verify-manifest \
  --pdf <pdf> --manifest <pdf>.orgsign.json
```

---

## 国家 eID が欲しい場合（任意・後続）

DigiDoc + SiVa を [pdf-esign-digidoc-runbook.md](../../../docs/org-os/pdf-esign-digidoc-runbook.md) どおりに用意したうえで、`operations esign`。個人カード署名は人間操作。**本決議の正本は組織シールで足りる。**
