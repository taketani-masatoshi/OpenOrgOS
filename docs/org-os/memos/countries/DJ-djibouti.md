# メモ: ジブチ — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `xroad_v7_dj`（コア再利用: `xroad_v7`）  
**Hub:** `HUB-AF-DJ`（Wave 4）

---

## 中核プラットフォーム

**X-Road** — ANSIE（Agence Nationale des Systèmes d'Information de l'État）管轄。e-Governance Academy（eGA）が 2021–2022 に導入支援。

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| 基盤 | X-Road Security Server（エストニアと同一ファミリー） |
| 関連 | GovStack プログラム |
| 識別 | member/subsystem — **DJ 固有コード** |

---

## OpenOrgOS Wire ラップ

- **`xroad_v7` adapter コアを再利用** — タリン Hub と実装コスト最小  
- `xroad_v7_dj` = DJ 向け member/subsystem 設定  
- AF pool で **技術的に最も再利用しやすい** 拠点

---

## 注意

- EE と同一 X-Road ファミリー — profile 差分は jurisdiction pack のみ  
- Adapter 優先 **P2**

---

## 参考

- https://ega.ee/project/djibouti-digital-interoperability-platform/
- https://ega.ee/project/public-administration-modernisation-djibouti/
