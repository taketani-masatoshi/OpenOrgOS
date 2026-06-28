# FY2026 予実差異分析（第2段階）

**対象期間:** 2026-02 〜 2027-01（FY2026）  
**正データ:** `data/plans/yojitsu-fy2026.yaml` · `data/finance/monthly/{YYYY-MM}.yaml`  
**更新:** 2026-06-08

---

## サマリ

| 指標 | 計画（yojitsu summary） | 月次 YAML 集計 | 差異 | 備考 |
|------|----------------------:|---------------:|-----:|------|
| 売上合計 | 7,500,000 | 7,500,000 | 0 | 2026-08 以降亀沢開業反映済 |
| 営業利益 | 4,166,309 | — | TBD | 月次から再集計予定 |
| 税引前利益 | 4,166,309 | — | TBD | |

> **第2段階:** 月次 YAML を **実取引入力** の正とし、予実ファイルの `actual` と突合する。現状は計画確定値（forecast closed）ベース。

---

## 月次差異（売上 · 抜粋）

| 月 | 計画売上 | 月次 YAML 売上 | 差異 | 主因 |
|----|--------:|-------------:|-----:|------|
| 2026-02 | 100,000 | 100,000 | 0 | 番町のみ |
| 2026-03 | 100,000 | 100,000 | 0 | |
| 2026-08 | 1,150,000 | 1,150,000 | 0 | 番町10万 + 亀沢105万 |
| 2026-09 | 1,150,000 | 1,150,000 | 0 | 予想ベース |
| 2026-10 | 1,150,000 | 1,150,000 | 0 | |

---

## パイプライン（実取引入力）

```
1. OTA / 銀行明細 → scratch/ または inbox
2. Finance Agent: data/finance/monthly/{YYYY-MM}.yaml 更新
3. npm run orgos -- finances summary --month YYYY-MM
4. 本ファイル · yojitsu-fy2026.yaml の actual 列を同期（手動 or 将来 sync）
5. npm run validate
```

**CLI:**

```bash
npm run orgos -- finances summary --from 2026-08 --to 2027-01
npm run orgos -- finances variance
npm run orgos -- skills run variance -o fy2026-variance-auto.md
```

---

## 次のアクション

- [ ] 2026-09 以降の **実績** を月次 YAML に入力（予想→実績）
- [ ] `yojitsu-fy2026.yaml` の `closing.basis` を `actual` へ移行
- [ ] 差異 >5% の月は `notes` に原因記載
- [ ] Executive ダッシュボードへ variance リンク

---

## 関連

- [yojitsu-fy2026.yaml](../../../data/plans/yojitsu-fy2026.yaml)
- [fy2026-pl.md](../fy2026-pl.md)
- [07-next-actions.md](../business-plan-decomposition/07-next-actions.md)
