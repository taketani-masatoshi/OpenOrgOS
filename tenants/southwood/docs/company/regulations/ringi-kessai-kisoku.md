# 稟議・決裁規程

**株式会社サウスウッド**  
**規程ID:** REG-004  
**版:** v1.0（制定案）  
**制定日:** [TBD]（取締役会又は株主総会決議 — 議事録リンク後に確定）

---

## 第1条（目的）

本規程は、当社の契約締結、支出、投資、組織間取引等について、**決裁権限と手続**を定め、内部統制及び OrgOS 上の承認ゲート（`org approval` · wire-governance）と整合させる。

## 第2条（適用範囲）

1. 本規程は、当社のすべての事業（事業開発・軽量 SaaS 運営等）に適用する。
2. グループ内組織（MAL · AIAC 等）との契約・資金移動も本規程の対象とする。
3. 詳細手続は [経費精算規程](keihi-seisan-kisoku.md) · [旅費規程](ryohi-kisoku.md) · [利益相反取引規程](riekisohan-torihiki-kisoku.md) と併用する。

## 第3条（基本原則）

1. 重要な取引は、**決裁を受けた後**に実行する。
2. 代表取締役（現任: **竹谷昌敏**）は本規程の遵守を確保し、必要な記録を残す。
3. 当社は **代表取締役1名** の体制であるため、区分 B における第二承認は **第4条第2項** に定めるとおり、株主又はグループ統括者の書面承認で補完する。
4. OrgOS 上の mutation（振込 · wire · 内部稟議）は **Operator RBAC** により、CEO / approver ロールのみが最終実行できる。

## 第4条（決裁権限）

金額は **税込目安** とし、OrgOS の wire-governance Tier（`steward/jurisdiction-packs/JP/wire-governance/approval-thresholds.yaml` · `policy_ref: REG-004`）と一致させる。

| 区分 | 金額（税込目安） | 決裁者 | 記録 · OrgOS |
|------|----------------:|--------|--------------|
| **A** 日常経費 | 〜 **10万円** | 代表取締役 **1名** | 領収書 · 経費精算 · `org approval`（任意 · Tier A） |
| **B** 通常契約・支出 | 10万超〜 **100万円** | 代表取締役 **＋** 株主又はグループ統括 CEO の **書面承認**（双方異名） | 契約台帳 · `org approval` **必須**（Tier B · co-approver） |
| **C** 重要契約・投資 | **100万円超** | **取締役会** 決議（取締役1名のときは **株主総会** 決議で代行可） | 議事録 · `org approval` **必須**（Tier C · board） |
| **D** 役員報酬・借入・保証 | 金額不問 | **株主総会** 又は法令に従う機関 | 議事録 · company event |

### 第4条第2項（少人数会社の第二承認）

区分 B の第二承認者は、次のいずれかとする。

1. **株主**（書面又は株主総会決議）
2. **グループ統括 CEO**（親会社 MAL 等 · 株主からの権限付与を前提とする書面承認）

代表取締役と第二承認者は **同一人物であってはならない**（`org approval approve --co-approver` の distinct チェックと整合）。

## 第5条（契約締結）

1. 契約は [`docs/contracts/`](../../contracts/00-このフォルダについて.md) および `data/contracts/CTR-*.yaml` に登録する。
2. 新規契約（CTR-XXX）は、**締結前**に区分 B 以上の承認を得る。
3. **組織間契約**（例: CTR-015 AIAC 業務委託 · CTR-012 賃借）は [inter-org-contract-workflow.md](../../../../steward/rules/inter-org-contract-workflow.md) に従い、起票側のみが正本を保持する（P2 まで相手テナントにドラフトを置かない）。
4. 甲乙の代表者が同一人物となる場合、又は株主・役員と取引する場合は、必ず [利益相反取引規程](riekisohan-torihiki-kisoku.md) の手続を先行させる。

## 第6条（支出・調達）

1. ベンダー見積の受領は `docs/procurement/quotes/received/` に索引する。
2. 発注・ PO は区分 A 以上に該当する場合、決裁区分に従う。
3. 法人クレジットカード利用は [クレジットカード規程](credit-card-kisoku.md) に従い、本規程の区分を準用する。

## 第7条（組織間 wire · protocol）

1. 組織間資金移動（wire）は `protocol notice` 経路とし、CEO / approver の承認を要する。
2. 区分 C に該当する wire は、**議事録を添付**したうえで実行する。
3. 監査証跡は `data/org/pending-approvals.yaml` · audit-bridge を正本とする。

## 第8条（ソフトウェア開発・委託）

1. 準委任・請負（月額10万円前後を含む）は、**SOW（業務指示書）** の範囲と報酬妥当性を区分 B 以上で確認する。
2. 同一人物が甲乙双方の代表となる開発委託（例: CTR-015）は、区分 B **かつ** REG-006 手続 **かつ** グループ CEO 確認を必須とする。
3. 本番デプロイ・外部 SaaS 契約の新規締結は、原則区分 B 以上とする。

## 第9条（緊急時）

1. サービス障害 · セキュリティインシデント · 契約上の期限対応等、緊急を要する支出は、代表取締役が **初動** できる。
2. 事後 **7営業日以内** に、該当区分に沿った `org approval` 又は議事録による追認を行う。
3. 追認不能な支出は、次回取締役会（又は株主総会）に報告する。

## 第10条（記録保存）

1. 決裁記録は `docs/company/governance/` · `docs/company/events/` · `data/company-events.yaml` に残す。
2. 内部稟議の CLI 記録は `data/org/pending-approvals.yaml` を正本とする。
3. 証憑スキャンは `records/`（L2 · gitignore）に保管し、索引のみ Git 追跡する。

## 第11条（改定）

本規程の改定は、**取締役会** の決議による。取締役が1名のみのときは **株主総会** の決議で代行できる。

---

## 関連

- [経費精算規程](keihi-seisan-kisoku.md)（REG-005）
- [利益相反取引規程](riekisohan-torihiki-kisoku.md)（REG-006）
- [文書管理規程](bunsho-kanri-kisoku.md)（REG-007）
- [経理規程](keiri-kisoku.md)（REG-027）
- OrgOS: `orgos org approval propose` · `orgos org approval approve`
- Wire 正本: `steward/jurisdiction-packs/JP/wire-governance/approval-thresholds.yaml`

**※ 制定前ドラフト。税理士・司法書士確認を推奨。制定後 `regulations.yaml` で REG-004 を `enabled: true` にし `orgos modules sync-context` を実行すること。**
