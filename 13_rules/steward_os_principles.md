# Steward OS — 基本原則

**版:** 2026-06-07 · **対象:** 株式会社 MAL · 不動産賃貸 + 旅館業

Steward OS は **文書管理システム（DMS）ではない**。経営支援 OS である。

---

## 4 層構造

```
Steward（経営統括）
    ↑ 要約のみ読む
Agent（部門統括）× 7
    ↑ Skill を呼ぶ
Skill（定型業務）× N
    ↑ 限定入力
Data / File（事実）
```

| 層 | 役割 | 禁止 |
|----|------|------|
| **Steward** | 目的関数・優先順位・意思決定案 | 全ファイル直読 · 部門実務 |
| **Agent** | 部門情報整理 · Skill 呼出 · 要約返却 | 担当外判断 · 全社独断 |
| **Skill** | 限定入出力の定型処理 | 巨大化 · 経営判断 |
| **Data** | YAML/MD/CSV/PDF の事実保持 | — |

---

## フォルダ整理の目的

「綺麗に分類すること」ではなく、以下を明確にする。

1. **誰が読むべきか**
2. **どの Agent が判断すべきか**
3. **どの Skill で処理すべきか**
4. **Steward がどの要約を見て全社判断すべきか**

---

## データ原則

- 正データ: `cursor/data/**/*.yaml`（編集後 `npm run validate`）
- 人向け: `docs/**`（MD · CSV · PDF）
- Steward が読むのは **原本ではなく Agent 要約**（`docs/reports/agent-summaries/`）
- 原本 PDF と要約 MD を分ける（inbox → records/ · outbox/）
- 物件単位 · 契約単位 · 年度単位で整理

---

## 人間の最終判断

エージェントは **提案と下書き** のみ。最終決定は **人間（段100%株主）** が行う。

---

## 関連

- [agent_skill_architecture.md](agent_skill_architecture.md)
- [folder_access_policy.md](folder_access_policy.md)
- [11_agents/](../11_agents/00-このフォルダについて.md)
- [12_skills/](../12_skills/00-このフォルダについて.md)
