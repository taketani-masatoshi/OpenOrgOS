# OrgOS digidoc4j sidecar — unsigned ASiC-E skeleton for pdf_esign (Phase D3 hardened)

**ADR:** [0014](../../docs/adr/0014-pdf-esign-national-eid.md) · **Plan:** [pdf-esign-digidoc-plan.md](../../docs/org-os/pdf-esign-digidoc-plan.md)

## Role

| Does | Does not |
|------|----------|
| `POST /container/create` PDF → unsigned `.asice` | Sign with card / store PIN |
| `GET /health` · `GET /ready` | Run SiVa validation |
| Bearer token auth · size / PDF magic gates | Listen on public Internet (bind loopback via compose) |

## Secrets

```bash
mkdir -p services/secrets
openssl rand -hex 32 > services/secrets/digidoc-sidecar.token
chmod 600 services/secrets/digidoc-sidecar.token
```

## Run

```bash
docker compose -f services/docker-compose.digidoc.yml up --build -d digidoc-sidecar

export ORGOS_DIGIDOC_SIDECAR_URL=http://127.0.0.1:9090
export ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK=1
export ORGOS_DIGIDOC_SIDECAR_TOKEN="$(cat services/secrets/digidoc-sidecar.token)"

npm run orgos -- operations esign prepare --id ES-… --skeleton
```

Local Maven (Java 17+):

```bash
cd services/digidoc-sidecar
export DIGIDOC_SIDECAR_TOKEN=dev-only-token
export ALLOW_UNAUTHENTICATED=false
mvn -q package && java -jar target/digidoc-sidecar-0.1.0.jar
```

## API

`POST /container/create` · `Authorization: Bearer <token>` · `Content-Type: application/json`

```json
{ "filename": "contract.pdf", "document": "<base64>", "mimeType": "application/pdf" }
```

Response: `{ "ok": true, "filename": "contract.asice", "document": "<base64>", "byte_length": N }`
