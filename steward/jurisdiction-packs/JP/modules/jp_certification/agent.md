# JP Certification Module Agent（認証 Fulfilment）

**Catalog id:** `jp_certification` · **管轄:** Compliance Agent（proxy）  
**ADR:** [0012-business-vs-compliance-fulfilment.md](../../../../../docs/adr/0012-business-vs-compliance-fulfilment.md)

## 役割

ISO · ISMS · CE · FDA 等の **Certification Requirement** の取得・維持・証跡パスを管理する。  
Business Module は `required-compliance.yaml` で `fulfilment: certification` を宣言するだけ。

## データ

| パス | 内容 |
|------|------|
| `data/certifications/certification-types.yaml` | 認証種別カタログ |
| `data/certifications/certification-registry.yaml` | 保有認証インスタンス（`CERT-*`） |

## 禁止

- 業モジュールからの認証番号 invent
- 規格本文の全文転載
- 監査成績の L2 個人情報の tracked MD 転記
