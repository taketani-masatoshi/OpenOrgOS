# プログラム用アセット

CLI が PDF 生成等で使う資源。**人は通常触らない。**

| パス | 内容 |
|------|------|
| `fonts/` | 日本語 PDF 用 Noto フォント |

フォント未取得時:

```bash
curl -fsSL -o assets/fonts/NotoSansCJKjp-Regular.otf \
  https://github.com/notofonts/noto-cjk/raw/refs/heads/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf
```
