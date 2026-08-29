# ADR 0017 — Canvas Web デモ向けテナント allowlist とトークン束縛

- **Status:** Accepted
- **Date:** 2026-07-14
- **Deciders:** OpenOrgOS maintainers

## Context

読取専用 Canvas Web（[ADR 0015](0015-canvas-view-model-dual-renderer.md) · [0016](0016-canvas-web-lan-bearer-auth.md)）は path `/t/{tenant}` で任意テナントの View Model を読め得た。デモ・初期運用では MAL と Southwood を論理分離し、Mac を不特定多数に晒さずに Tailscale 等で届ける必要がある。本格 IdP / `operators.yaml` 連動は次段階とする。

## Decision

1. **起動プロセスの allowlist** — 既定は `--tenant` のみ。`--allow-tenants` で明示拡張（特権オペ向け）。
2. **API** — allowlist 外の `/api/t/{tenant}/…` は **404**（存在隠蔽）。
3. **Bearer** — 共有 `--token` またはテナント別 `--tenant-token` / `ORGOS_CANVAS_WEB_TOKEN_<ID>`。提示トークンで見えるテナントだけを `/api/config.json` の `allow_tenants` に返す。
4. **到達** — デモ最短は Tailscale（または同等）+ 非公開。WAN への素ポート公開は運用しない（ランブック正本）。
5. **チャネル境界（方針）** — Canvas = 閲覧のみ。承認・エージェント/DB 変更 = Cursor/CLI/Steward Chat（PC）。Slack 等 = 秘書・Steward との短文のみ（設定変更の実行面にしない）。

## Consequences

### Positive

- デモで MAL 専用 / Southwood 専用プロセスを簡単に立てられる
- 同一ホストでもクロステナント読取を既定で遮断
- SPA はサーバ config の既定テナントに従う（`mal` ハードコード撤去）

### Negative / risks

- まだユーザ別 RBAC（`canvas:read`）ではない — 秘密の取り回しが運用品質を決める
- `?token=` の履歴リスクは 0016 と同様（短命・ローテ）

## Related

- Runbook: [canvas-web-demo-runbook.md](../org-os/canvas-web-demo-runbook.md)
- Serve: `src/lib/canvas-views/web-serve.ts`
