# OrgOS — Beta operations

**Status:** public **beta**. Expect frequent updates.  
**Product:** OrgOS reference implementation (`orgos` CLI · steward framework · demo Docker).  
**Not this repo:** OpenOrgOS Community web (`OS_Community` / `community.oorgos.org`) — registry and governance portal only.

## Security recommendations (required reading)

1. **Isolated host** — dedicated machine or VM you administer. Do not co-host untrusted workloads with live tenant data.
2. **Private network first** — bind demo UI to `127.0.0.1` only. Do not publish port `9470` on the public Internet.
3. **Tenant separation** — company data lives under `tenants/`. Never commit production secrets; use `.env` / local overrides excluded from git.
4. **Demo ≠ production** — `orgos-demo` is for trial. Production-like use means CLI + your own tenant on hardware you control ([docs/quickstart.md](./quickstart.md)).
5. **Rotate after upgrades** — re-issue local tokens / OAuth clients when moving between beta tags if credentials were shared for trials.
6. **Watch the channel feed** — [`channel/latest.json`](../../channel/latest.json) announces the newest beta and security notes.

## Try OrgOS (Demo Docker)

```bash
# Pinned beta
docker pull ghcr.io/taketani-masatoshi/orgos-demo:0.8.0-beta.3
docker run --rm -p 127.0.0.1:9470:9470 ghcr.io/taketani-masatoshi/orgos-demo:0.8.0-beta.3

# Moving beta pointer
docker pull ghcr.io/taketani-masatoshi/orgos-demo:beta
```

- Chat: http://127.0.0.1:9470/
- Wire console: http://127.0.0.1:9470/wire/
- Verify: `ORGOS_DEMO_IMAGE=ghcr.io/taketani-masatoshi/orgos-demo:0.8.0-beta.3 npm run demo:docker:verify-ghcr`

Platforms: **linux/amd64** (arm64 not required for this beta channel).

## CLI (operators / OOO path)

```bash
git clone https://github.com/taketani-masatoshi/OpenOrgOS.git
cd OpenOrgOS
git checkout v0.8.0-beta.3
npm ci
npm run orgos -- --tenant demo validate
npm run orgos -- doctor
```

Release tarballs / npm packs appear on the GitHub Release when the `release` workflow succeeds. Optional npm publish is maintainer-controlled (see [RELEASE.md](../../RELEASE.md)).

## How we push updates

1. Bump `VERSION` and `channel/latest.json`.
2. Commit on `main` and tag: `git tag -a v0.8.0-beta.N -m "..." && git push origin main --tags`
3. Workflows:
   - **`demo-docker`** — smoke + GHCR push (`:version` and `:beta` for prereleases)
   - **`release`** — GitHub Release + npm pack artifacts
4. Operators pull the new image / checkout the new tag when `channel/latest.json` advances.

Urgent betas may raise `minSupported` — retire older demos.

## Related

| Resource | Link |
|----------|------|
| Quickstart | [quickstart.md](./quickstart.md) |
| Demo Docker design | [demo-docker.md](./demo-docker.md) |
| Maintainer release process | [RELEASE.md](../../RELEASE.md) |
| Community (web registry) | https://github.com/taketani-masatoshi/OS_Community |
| Overview site | https://oorgos.org |
