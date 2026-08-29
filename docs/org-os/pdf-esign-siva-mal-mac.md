# SiVa on MAL Mac（Track B · BP2）

**計画:** [pdf-embed-and-digidoc-production-plan.md](./pdf-embed-and-digidoc-production-plan.md) · **Acceptance §B:** [pdf-esign-production-acceptance.md](./pdf-esign-production-acceptance.md)  
**前提:** SiVa ホスト = **MAL の Mac**（2026-07-14 確定）· 公式 Docker test compose は使わない

---

## 1. 何を用意するか

| 部品 | 役割 |
|------|------|
| **JDK 17+** | SiVa JAR を動かする |
| **Maven** | open-eid/SiVa をビルドして `*-exec.jar` を得る |
| **siva-webapp JAR** | `http://127.0.0.1:8080` で `/validate` |
| **OrgOS env** | `ORGOS_SIVA_MODE=live` · loopback URL · `ALLOW_HTTP_LOOPBACK=1` |

HTTPS reverse proxy は推奨。当面は **loopback HTTP + フラグ** で BP2/BP3 を通せます。

---

## 2. ワンショット（推奨）

```bash
# 初回（JDK 17 + Maven — OpenJDK 26 ではビルド失敗するため @17）
bash scripts/setup-siva-mal-mac.sh install-deps
bash scripts/setup-siva-mal-mac.sh build
# start は setsid 二重 fork（IDE/agent シェル終了でも JVM が生き残る）
# 初回 TSL 取得で 1–3 分かかることがある
bash scripts/setup-siva-mal-mac.sh start

eval "$(bash scripts/setup-siva-mal-mac.sh env)"
npm run siva:mal-mac:probe
```

停止:

```bash
bash scripts/setup-siva-mal-mac.sh stop
```

起動メモ:

| 項目 | 値 |
|------|-----|
| Heap | `-Xms256m -Xmx1536m`（TSL 中の OOM 回避） |
| Ready 待ち | 最大 180s · ログに `Started SivaWebApplication` |
| Loopback | `ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK=1`（HTTPS なし当面） |

成果物（gitignore）:

- `services/siva/src/` — SiVa ソース clone  
- `services/siva/jars/` — ビルド済み `siva-webapp-*-exec.jar` のコピー  
- `services/siva/run/` — pid / ログ  

---

## 3. 手動かみ砕き

### 3.1 依存

```bash
brew install --cask temurin@17
brew install maven
java -version   # 17+
mvn -version
```

### 3.2 ビルド（公式: without docker）

```bash
mkdir -p services/siva
git clone --depth 1 --branch release-3.10.1 https://github.com/open-eid/SiVa.git services/siva/src
cd services/siva/src
./mvnw -pl siva-parent/siva-webapp -am package -DskipTests
# JAR: siva-parent/siva-webapp/target/siva-webapp-*-exec.jar
```

参考: [SiVa README — Without docker](https://github.com/open-eid/SiVa#without-docker) · [deployment guide](https://open-eid.github.io/SiVa/siva3/deployment_guide/)

### 3.3 起動

```bash
java -jar siva-webapp-*-exec.jar --server.port=8080
# 既定: http://127.0.0.1:8080
```

### 3.4 OrgOS

```bash
export ORGOS_SIVA_MODE=live
export ORGOS_SIVA_BASE_URL=http://127.0.0.1:8080
export ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK=1
npm run orgos -- --tenant mal operations esign ready --json
```

期待: `siva_mode: live` · `siva_configured: true` · token 非露出。

テナント L1 設定（秘密なし）は `tenants/mal/data/pdf-esign/digidoc.yaml` に loopback 許可を書いてある。URL は **env 優先**でよい。

---

## 4. Acceptance §B 対応表

| 項目 | MAL Mac 当面 |
|------|----------------|
| test compose 不使用 | ✅ スクリプトは JAR 経路のみ |
| siva-webapp JAR | `setup-siva-mal-mac.sh build` |
| reverse proxy HTTPS | 任意 · 後で可 · 当面 loopback |
| OCSP / TSP egress | Mac がインターネットに出られること |
| env live + base URL | `setup-siva-mal-mac.sh env` |
| 監視 | `probe-siva-mal-mac.sh` + ログ `services/siva/run/siva.log` |

---

## 5. 次（BP3）

SiVa が動いたら、段さんのカードで:

```bash
eval "$(bash scripts/setup-siva-mal-mac.sh env)"
# digidoc sidecar も必要なら:
npm run smoke:digidoc-sidecar
npm run orgos -- --tenant mal operations esign create --pdf ./契約.pdf --title "…"
# … prepare --skeleton → DigiDoc4 署名 → accept-live
```

詳細: [pdf-esign-digidoc-runbook.md](./pdf-esign-digidoc-runbook.md) · [pdf-esign-production-acceptance.md](./pdf-esign-production-acceptance.md) §C
