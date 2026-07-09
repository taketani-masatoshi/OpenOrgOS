# OrgOS Demo Docker — All-in-one（利用者獲得）

**版:** 0.1 · **日付:** 2026-07-08  
**状態:** Phase 0 設計正本 · Phase 1〜 実装中  
**目的:** 「手元で動かして試す」層の入口を **OS 非依存の 1 本** に揃える

> **本番運用ドキュメントではない。** 本番は [operator-production.md](../operator-production.md) · systemd/launchd。

---

## 1. 意思決定（Phase 0 固定）

| 項目 | 決定 |
|------|------|
| **イメージ名** | `ghcr.io/taketani-masatoshi/orgos-demo`（fork では `<owner>` を小文字 GitHub 名に置換） |
| **タグ** | semver（`0.8.0`）· `latest`（最新安定）· `main`（任意・CI） |
| **同梱サービス（v1）** | **Operator Console のみ**（Chat + Wire SPA · `:9470`） |
| **同梱しない（v1）** | Witness Hub · Protocol API/Relay · nginx TLS · Proposal 3 mTLS |
| **同梱 tenant** | `demo`（JP · 株式会社デモ相当 · L2 なし） |
| **workspace 戦略** | イメージに **seed** を同梱 · volume が空なら seed をコピー |
| **認証（デモ）** | Chat auth オフ（`STEWARD_CHAT_AUTH=0`）· Wire `WIRE_CONSOLE_AUTH=dev` · **本番禁止** |
| **ランタイム env** | `ORGOS_ENV=demo` · **`NODE_ENV=production` にしない**（prod fail-closed 回避） |
| **LLM** | 既定 `ORGOS_LLM_MOCK=1`（キーなしで起動）· 実 LLM は任意 |
| **対象 OS** | Docker Desktop / Engine がある **Mac · Windows · Linux** |
| **非目標（このイメージ）** | 本番耐性 · マルチテナント SaaS · Hub クラスタ |

---

## 2. 境界

```
┌─────────────────────────────────────────────┐
│  orgos-demo イメージ                         │
│  ORGOS_HOME = /opt/orgos                     │
│    steward/ · schemas/ · dist/ · SPA dist    │
│  seed workspace (read-only in image)         │
│    orgos.yaml · tenants/demo/（L0–L1 のみ）   │
└──────────────────┬──────────────────────────┘
                   │ entrypoint: seed → volume
                   ▼
┌─────────────────────────────────────────────┐
│  Volume: orgos-demo-workspace → /workspace   │
│  ORGOS_WORKSPACE=/workspace                  │
│  ORGOS_TENANT=demo                           │
│  Process: operator console start :9470       │
└─────────────────────────────────────────────┘
```

| 層 | パス | 永続 |
|----|------|------|
| Core | `/opt/orgos`（イメージ内） | イメージ更新で置換 |
| Workspace | `/workspace`（volume） | **永続化推奨** |
| シークレット | 環境変数のみ · イメージに鍵を焼き込まない | — |

---

## 3. 成功判定（Acceptance）

ローカルまたは CI で次をすべて満たすこと。

| # | 判定 | 手段 |
|---|------|------|
| A1 | コンテナが Healthy | `GET http://127.0.0.1:9470/health` → 200 |
| A2 | Chat UI が返る | `GET http://127.0.0.1:9470/` → 200 · HTML |
| A3 | Wire UI が返る | `GET http://127.0.0.1:9470/wire/` → 200 · HTML |
| A4 | 起動タイムアウト | `compose up` 後 **120 秒以内**に A1 |
| A5 | ドキュメント | README / quickstart に `docker compose … deploy/demo` が **第一 OTC** · **完了** |

Phase 2（GHCR）追加判定:

| # | 判定 | 手段 |
|---|------|------|
| B1 | `docker pull ghcr.io/<owner>/orgos-demo:<semver\|main>` | workflow `demo-docker` · job `publish` |
| B2 | pull 後に A1–A4 | publish ジョブ末尾の `acceptance.sh` |

**タグ戦略:** `v0.8.0` → `0.8.0` + `latest` · `main` ブランチ push → `main`  
**オーナー:** `github.repository_owner` を小文字化（設計例の `orgos-reference` は org 名に合わせる）

CI 正本: [.github/workflows/demo-docker.yml](../../.github/workflows/demo-docker.yml)

---

## 4. セキュリティ境界（デモ専用）

| ルール | 理由 |
|--------|------|
| `ORGOS_ENV` は **`demo`**（`production` にしない） | prod checklist / fail-closed と衝突しない |
| Auth オフ・弱いデモキーは **localhost 想定** | ホストは `127.0.0.1:9470` のみバインド（compose / `docker run` 例） |
| L2/L3 を seed に入れない | 分類ポリシー · 公開イメージ安全 |
| README 冒頭に「**本番利用禁止**」 | 誤用防止 |
| OpenAI キーはユーザーが任意注入 | イメージに含めない |
| GHCR Private のまま配布 | 匿名 pull 不可 — **Public 推奨** または PAT pull（quickstart §0a） |

公開ポートは **ホスト 127.0.0.1:9470** のみ（コンテナ内は `0.0.0.0` で listen · 問題なし）。

残リスク対策: [deploy/demo/PUBLISH.md](../../deploy/demo/PUBLISH.md) · `verify-ghcr.sh`

---

## 5. 利用者フロー（目標 UX）

```bash
# 公開イメージ（main マージ / v* タグ後 · owner は GitHub org/user）
docker pull ghcr.io/taketani-masatoshi/orgos-demo:0.8.0
docker run --rm -p 127.0.0.1:9470:9470 ghcr.io/taketani-masatoshi/orgos-demo:0.8.0

# リポジトリから（常に可）
git clone <repo-url> orgos-reference && cd orgos-reference
docker compose -f deploy/demo/docker-compose.yaml up --build
bash deploy/demo/acceptance.sh   # 任意
```

ブラウザ: [http://127.0.0.1:9470/](http://127.0.0.1:9470/)（Chat）· [http://127.0.0.1:9470/wire/](http://127.0.0.1:9470/wire/)（Wire）

利用者ドキュメント入口: [../quickstart.md](../quickstart.md) §0 · ルート [README.md](../../README.md)

次のステップ（B 層）は既存の:

```bash
npm install -g @orgos/cli
orgos init myco --name "My Co"
```

---

## 6. 実装フェーズ

| Phase | 内容 | 完了条件 |
|-------|------|----------|
| **0** | 本設計 · `deploy/demo/` 骨格 | 本ドキュメント合意相当 · **完了 2026-07-08** |
| **1** | Dockerfile · entrypoint · compose · seed | A1–A4 · **完了 2026-07-08**（`acceptance.sh`） |
| **2** | GHCR · release 連携 · CI スモーク | B1–B2 · **完了 2026-07-08**（workflow 定義 · main/tag で検証） |
| **3** | README / quickstart 入口差し替え | A5 · **完了 2026-07-08** |
| **4** | サイズ削減 · linux/amd64+arm64 | **完了 2026-07-08** · alpine runtime · ~328MB（was ~506MB）· CI multi-arch |

### Phase 4 詳細

| 項目 | 内容 |
|------|------|
| Runtime base | `node:22-alpine`（curl/openssl apt 削除 · health は Node `fetch`） |
| Entrypoint | POSIX `/bin/sh`（alpine に bash なし） |
| Prod deps | build 段階で `/stage` に自己完結 `npm install --omit=dev` |
| Prune | runtime から `docs/` · `deploy/` · `*.map` 除外 |
| `.dockerignore` | tests · 他テナント · deploy デモ外を除外 |
| Multi-arch | `demo-docker` publish: `platforms: linux/amd64,linux/arm64`（QEMU） |
| サイズ目安 | ローカル arm64 ~**328MB**（Phase 1 bookworm-slim ~506MB） |

**明示的に後回し:** 分割イメージ · Helm · Hub 同梱 · Windows ネイティブ。

---

## 7. ファイル配置

| パス | 役割 |
|------|------|
| [docs/org-os/demo-docker.md](demo-docker.md) | **設計正本（本ファイル）** |
| [deploy/demo/](../../deploy/demo/) | compose · Dockerfile · entrypoint · seed · env |
| `deploy/demo/prepare-seed.sh` | `tenants/demo` → seed（L2/プロトコル雑音除外 · gitignore 実データはビルドに含めない） |
| `.github/workflows/demo-docker.yml` | smoke（A1–A4）· GHCR publish（B1–B2） |
| `deploy/demo/verify-ghcr.sh` | 手元で B1–B2 再現 · `npm run demo:docker:verify-ghcr` |
| `deploy/demo/PUBLISH.md` | main マージ後 · Package Public · 残リスク対策 |
| `npm run demo:docker:up` / `demo:docker:accept` | ローカル起動・受け入れ |

**実装メモ（Phase 1）:** Operator Console SPA は `process.cwd()/apps/...` を参照するため、entrypoint は **`cd $ORGOS_HOME`** したまま起動し、データは `ORGOS_WORKSPACE=/workspace` で分離する。

---

## 8. 関連

- [quickstart.md](../quickstart.md) — インストール段階（Phase 3 で Demo を先頭へ）
- [operator-production.md](../operator-production.md) — 本番（本イメージ不可）
- [runbook-orgos.md](../runbook-orgos.md) — 運用 runbook
- [framework-backlog.md](../framework-backlog.md) — DIST-DEMO フェーズ
