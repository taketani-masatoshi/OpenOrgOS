# CLI · npm 製品リネーム — Steward OS → OrgOS

**版:** 1.0 · **日付:** 2026-06-28  
**用語:** [orgos-vocabulary.md](orgos-vocabulary.md)

---

## 1. 変更概要

| 項目 | 旧 | 新 | 互換 |
|------|-----|-----|:----:|
| 製品名 | Steward OS | **OrgOS** | 文書 |
| npm パッケージ | `steward-os` | **`orgos-reference`** | lockfile 更新 |
| CLI コマンド | `steward` | **`orgos`** | `steward` 残存 · 警告 |
| npm script | `npm run steward` | **`npm run orgos`** | `npm run steward` 残存 |
| テナント env | `STEWARD_TENANT` | **`ORGOS_TENANT`** | 両方有効 |

**変更しない（実装詳細）:** ディレクトリ `steward/` · 定数 `STEWARD_*_DIR` · 内部 protocol env（`STEWARD_PROTOCOL_WRITE_GUARD` 等）

---

## 2. 移行（ユーザー）

```bash
# 推奨
export ORGOS_TENANT=mal
npm run orgos -- --tenant mal validate
npm run orgos -- status --orgos

# 旧（非推奨 · 1 回警告）
export STEWARD_TENANT=mal
npm run steward -- validate
```

警告を消す（CI 移行期のみ）: `ORGOS_SUPPRESS_LEGACY_WARN=1`

---

## 3. 本番 deploy

| 旧 | 新 |
|----|-----|
| `/opt/steward-os` | **`/opt/orgos-reference`**（推奨）· `STEWARD_ROOT` フォールバック可 |
| `npm run steward -- …` | **`npm run orgos -- …`** |
| `STEWARD_TENANT` | **`ORGOS_TENANT`**（systemd Environment） |

systemd ユニット名 `steward-protocol-*@` は **ファイル名据え置き** — `ExecStart` のみ `orgos` に更新済み。

---

## 4. Agent 名

| 旧混同 | 正 |
|--------|-----|
| Steward OS = 製品 | **OrgOS** = 製品 |
| Steward = 製品 | **Steward Agent** = 経営統括 Agent |

---

## 5. 改定履歴

| 日付 | 内容 |
|------|------|
| 2026-06-28 | 初版 — orgos CLI · orgos-reference package · 後方互換 |
