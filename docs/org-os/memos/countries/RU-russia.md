# メモ: ロシア — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `ru_smev4`（legacy: `ru_smev3`）  
**Hub:** なし

---

## 中核プラットフォーム

**СМЭВ**（SMEV — Система межведомственного электронного взаимодействия）— 連邦官庁間電子相互作用。

---

## 技術スタック

| 版 | 内容 |
|----|------|
| **SMEV3** | SOAP/XML · WS-Security |
| **SMEV4** | REST/JSON · OpenAPI · **ESIA** 認証 |
| **接続** | **SKZI** 暗号網（ViPNet 等）— 公開 internet 非対応 |

---

## OpenOrgOS Wire ラップ

- 技術的には encode/decode 可能  
- **接続 · 認証 · 政治リスク** がハードル  
- Adapter 優先 **P5** — 制裁・閉域評価を別途

---

## 注意

- 独立閉域ファミリー — 他国 adapter との再利用低  
- Hub 配置予定なし  
- 公開 API ではなく政府専用網

---

## 参考

- https://info.gosuslugi.ru/（SMEV 情報）
