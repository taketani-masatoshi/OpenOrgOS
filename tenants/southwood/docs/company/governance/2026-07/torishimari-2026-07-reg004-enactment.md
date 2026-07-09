# 取締役会議事録（稟議・決裁規程 制定案）

**株式会社サウスウッド**

> **状態:** ドラフト — 開催・決議前。決議後に制定日を `ringi-kessai-kisoku.md` へ反映し、REG-004 を有効化する。

---

| 項目 | 内容 |
|------|------|
| 開催日時 | [TBD] |
| 開催場所 | 本店（〒102-0084 東京都千代田区二番町1）又はオンライン |
| 出席取締役 | 竹谷昌敏（代表取締役） |
| 議長 | 竹谷昌敏 |
| 記録者 | [TBD] |

**注:** 取締役1名のため、会社法上の取締役会決議は株主総会決議で代行する運用も可。株主総会で行う場合は [shukai-2026-07-reg004-enactment.md](shukai-2026-07-reg004-enactment.md) を使用する。

---

## 議事の経過及びその要領

### 第1号議案　稟議・決裁規程（REG-004）の制定

議長は、契約 · 支出 · 組織間取引の決裁権限を定める **稟議・決裁規程** を、2026年[TBD]付で制定することを提案した。

**規程要点:**

| 区分 | 金額（税込） | 決裁 |
|------|-------------|------|
| A | 〜10万円 | 代表取締役1名 |
| B | 10万超〜100万円 | 代表取締役 ＋ 株主又はグループ CEO 書面承認 |
| C | 100万円超 | 取締役会（又は株主総会） |
| D | 役員報酬等 | 株主総会等 |

- 施行文: `docs/company/regulations/ringi-kessai-kisoku.md`
- OrgOS 連携: `org approval` · JP wire-governance Tier A/B/C

**結果:** [ ] 可決 / [ ] 否決

### 第2号議案（参考）　REG-004 有効化に伴う OrgOS 手続

可決した場合、次を実施する。

1. `tenants/southwood/regulations.yaml` — REG-004 を `enabled: true`
2. `orgos modules sync-context`
3. `orgos validate`
4. company event 記録（任意）: `EVT-*-governance-reg004-enactment`

**結果:** [ ] 承認 / [ ] 保留

---

**[TBD 年] [TBD 月] [TBD 日]**

| 役職 | 氏名 | 印 |
|------|------|-----|
| 代表取締役 | 竹谷昌敏 | |

---

## 関連

- 規程本文: [../regulations/ringi-kessai-kisoku.md](../regulations/ringi-kessai-kisoku.md)
- 利益相反（CTR-015 等）: [../regulations/riekisohan-torihiki-kisoku.md](../regulations/riekisohan-torihiki-kisoku.md)
