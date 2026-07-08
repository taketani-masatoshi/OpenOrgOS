# AIAC（`aiac`）

**Inter-org protocol デモ用の第3組織テナント。**

| 項目 | 値 |
|------|-----|
| 自社 | AIAC株式会社（L1 ダミー） |
| 既存デモ | `mal`（貸主）· `southwood`（借主） |
| 役割 | mesh relay · 多当事者 wire · peer `PEER-003` 相当の受け口検証 |

## クイックスタート

```bash
npm run orgos -- --tenant aiac validate
npm run orgos -- --tenant aiac protocol validate

# 2 組織デモ（mal ↔ southwood）
npm run demo:inter-org

# mesh（mal 起点 · PEER-002 → PEER-003）
npm run demo:mesh-deliver
```

正本: [docs/org-os/inter-org-two-org-demo.md](../../docs/org-os/inter-org-two-org-demo.md) · [docs/runbook-orgos.md](../../docs/runbook-orgos.md) §7
