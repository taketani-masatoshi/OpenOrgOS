# 法人書類 PDF

**人が読む・印刷する・提出する PDF** の置き場です。  
対応する Markdown は同じ [`../`](../)（`docs/corporate/`）にあります。

```
pdf/
├── kessan/   決算報告書
└── jigyo/    事業報告書
```

再生成（YAML 正データから）:

```bash
npm run steward -- report annual --fy FY2026
```

中身は gitignore 対象（再生成可能）。フォント等のプログラム用資源は [`assets/`](../../../assets/) にあります。
