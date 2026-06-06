# 人事・労務台帳

**雇用開始時** に整備する帳簿です。現状 **従業員0名** — テンプレートのみ用意。

---

## 帳簿一覧

| 帳簿 | テンプレート | 法令 | 保管 |
|------|-------------|------|------|
| **従業員名簿** | [templates/従業員名簿.csv](templates/従業員名簿.csv) | 労基法第107条 | 退職後3年 |
| **賃金台帳** | [templates/賃金台帳.csv](templates/賃金台帳.csv) | 労基法第108条 | 支払後3年 |
| **出勤簿** | [templates/出勤簿.csv](templates/出勤簿.csv) | 労基法第109条 | 3年 |
| **有給休暇管理簿** | [templates/有給休暇管理簿.csv](templates/有給休暇管理簿.csv) | 労基法 | 3年 |
| **採用同意書** | [../privacy/templates/採用時個人情報同意書.md](../privacy/templates/採用時個人情報同意書.md) | 個情法 | 上記に準ず |

正データ（非個情）: [`cursor/data/hr/employees.yaml`](../../../cursor/data/hr/employees.yaml)

---

## 雇用開始チェックリスト

```
□ 就業規則・雇用契約書の制定（未）
□ 従業員名簿へ記入
□ 雇用保険・社会保険の届出（該当時）
□ マイナンバー: 別途厳重管理（本リポジトリに保存しない）
□ 個人情報同意書の署名保管 → records/
□ REG-015 安全衛生・REG-010 宣言の実施
□ 賃金台帳・出勤簿の運用開始
```

---

## records/

記入済みファイルは **Git 非追跡**。  
[`records/README.md`](records/README.md) 参照。

---

## 関連

- [REG-015 安全衛生管理規程](../../corporate/regulations/anzen-eisei-kanri-kisoku.md)
- [REG-010 個人情報保護](../../corporate/regulations/kojin-joho-hogo-kisoku.md)
- [payroll.yaml](../../../cursor/data/finances/payroll.yaml)

*最終更新: 2026年6月*
