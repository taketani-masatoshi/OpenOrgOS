---
event_id: EVT-20260819-governance-passkey-hybrid-qr
occurred_at: 2026-08-19
kind: governance
status: open
artifact_dir: docs/company/artifacts/2026-08/EVT-20260819-governance-passkey-hybrid-qr/
---

# iPhone PassKey を業界標準 QR に寄せる

## 概要

高額承認の PassKey を、自前 URL の QR や approve サブドメイン上のセレモニーではなく、Google / GitHub / Microsoft / Apple と同じ **ブラウザ標準の hybrid QR（iPhone カメラ + Face ID）** に寄せる。ログインの Mac Touch ID は維持する。

計画正本（リポジトリ）: `docs/org-os/passkey-iphone-qr-implementation-plan.md`（OS_Steward）

## 経緯

- 2026-08-19: Google、GitHub、Microsoft Entra、Apple、Amazon、Shopify Shop Pay、KAYAK（Passkey Central）の公開実装を調査
- 2026-08-19: いずれもサイトが PassKey 用 QR を描画せず、`navigator.credentials` 後の OS / ブラウザ UI に任せることを確認
- 2026-08-19: Dual RP（`127.0.0.1` と `localhost:4178`）は hybrid では不要と判断。同一コンソール origin + `purpose=settlement` を採択候補とする
- 2026-08-19: 会社イベントとして記録。フェーズ 1（Mac 上で登録セレモニー）以降は CEO / OOO 承認後に実装
- 2026-08-21: フェーズ 1 実装 — settlement 登録をコンソール RP（`127.0.0.1`）上の hybrid `create` に統一。approve ポップアップ廃止

## 関連 ID

- ADR-0037 Dual PassKey settlement step-up
- REG-004 稟議・決裁（金額ティア B/C の step-up）

## 出力書類

- 索引: `docs/company/artifacts/2026-08/EVT-20260819-governance-passkey-hybrid-qr/00-artifact-index.md`
- 計画へのポインタ: `docs/company/artifacts/2026-08/EVT-20260819-governance-passkey-hybrid-qr/plan-pointer.md`
- 正本: リポジトリ `docs/org-os/passkey-iphone-qr-implementation-plan.md`
