# メモ: エジプト — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `eg_digital_egypt`  
**Hub:** `HUB-AF-CAI`（カイロ · Wave 4）

---

## 中核プラットフォーム

**Digital Egypt**（digital.gov.eg）— MCIT 管轄の統合デジタルプラットフォーム。

| 系統 | 用途 |
|------|------|
| **Digital Egypt Platform** | 210+ 政府サービス · モバイルアプリ |
| **G2G API** | 省庁間連携 · 銀行等との API 統合（例: Banque Misr） |
| **Digital ID** | パイロット段階（2025 時点） |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| アーキ | SOA 先行 · 中央プラットフォーム + API 連携 |
| プロトコル | REST API（G2G · G2B） |
| インフラ | 政府データセンター · 安全ネットワーク |

---

## OpenOrgOS Wire ラップ

- `eg_digital_egypt` — G2G encode/decode  
- Witness: MS 直行 · landing DC · Ramses 非依存  
- **組織間合意 + API** をセットで設計（意味相互運用が弱い歴史）

---

## 注意

- 中央 GW 型 — TR · GE と近い  
- Adapter 優先 **P4** · 現地パートナー推奨

---

## 参考

- https://digital.gov.eg/
- https://mcit.gov.eg/en/digital_egypt
