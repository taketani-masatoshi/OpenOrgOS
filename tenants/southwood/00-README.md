# 株式会社サウスウッド（`southwood`）

**Inter-org protocol デモ用の相手先組織テナント。**

| 項目 | 値 |
|------|-----|
| 自社 | 株式会社サウスウッド（L1 ダミー） |
| 取引相手（peer） | `mal` — 株式会社 MAL |
| シナリオ | CTR-012 オフィス賃貸借契約（MAL 本社区画）の締結通知 |

## クイックスタート

```bash
npm run demo:inter-org

npm run steward -- --tenant southwood protocol transaction list
npm run steward -- --tenant southwood protocol audit verify
```

正本ウォークスルー: [docs/org-os/inter-org-two-org-demo.md](../../docs/org-os/inter-org-two-org-demo.md)
