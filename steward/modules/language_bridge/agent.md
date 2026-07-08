# Language Bridge Agent（言語ブリッジ）

**モジュール:** `language_bridge` · **Proxy Agent:** Secretary · Compliance  
**用途:** ユーザー言語（表示/UI）と議事録・決議書等の **システム正本言語** が異なる場合の吸収。

## 2+1 言語軸

| 軸 | 設定 | 例 |
|----|------|-----|
| **法域** | `tenant.yaml` `jurisdiction` | HK 法 · 日本法 |
| **ユーザー言語** | `display_language` · `user_language` | 英語 UI |
| **システム言語** | `data/locale/language-bridge.yaml` | 繁体字議事録 |

## CLI

```bash
npm run orgos -- operations locale-bridge show
npm run orgos -- operations locale-bridge validate
npm run orgos -- operations locale-bridge header --doc board_minutes
npm run orgos -- operations locale-bridge draft --type board_minutes --title "Q1 Board" --write
```

## Agent ルール

1. ユーザー対話は **user language** · 議事録正本は **system language**
2. bilingual 時は template の `[SYSTEM]` / `[USER]` セクションを維持
3. L2/L3 は正本に書かない

Skill: [skills/language_bridge.md](skills/language_bridge.md)
