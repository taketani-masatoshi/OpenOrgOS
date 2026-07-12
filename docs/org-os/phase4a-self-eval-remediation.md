# Phase 4a 自己評価ギャップ — 対応策と実装

**Date:** 2026-07-12 · **Parent:** [phase4a-washout-f7-f10.md](phase4a-washout-f7-f10.md)

自己評価で減点した項目への **実装済み対策**。

---

## P0 — 鍵 / DID / mail-config / PEER-003 衛生

| 問題 | 対策 |
|------|------|
| Vitest 後に鍵・DID・mail-config がズレる | `tests/setup-restore-protocol.ts` が `wire-gateway.yaml` も preserve · restore 後に DID 再同期 + PEER-003 + mail-config 復元 |
| mail-config が Zone C で消える | 正本例: `deploy/mal-pilot/mail-config.mal-pilot.yaml.example`（tracked） |
| PEER-003 消失 → hash mismatch | Live / Vitest 中のみ `ensureEmailWireLoopbackPeer` · tracked `peers.yaml` には載せない · `removeEmailWireLoopbackPeer` + suite `afterAll` で除去 |
| Vitest 並行で ledger 消失 → live が `not_sent` | `PRESERVE_PROTOCOL_SUBDIRS` に `delivery-attempts.*` · confirmation は wire-sent / inbox から rehydrate |
| trust registry と鍵のズレ | `mal-wire-hygiene.sh` が `ORGOS_HYGIENE_UPDATE_TRUST_REGISTRY=1` で明示同期（既定の CLI/Vitest は **書かない**） |
| `hygiene-synced` notes 蓄積 | stamp 追記を廃止 · `stripHygieneSyncedNotes` で既存汚染を除去 |
| 鍵ファイル消失 | `.bak-*` から復元を優先し、無ければ新規作成（**mint 時は trust registry を更新しない**） |

```bash
./scripts/mal-wire-hygiene.sh mal
# または
ORGOS_HYGIENE_UPDATE_TRUST_REGISTRY=1 npm run orgos -- protocol wire-hygiene --tenant mal
```

Live / ship-gate 前に `wire-live-verify.sh` が hygiene を自動実行。

---

## P1 — F7 WIP 分離（実装）

```bash
./scripts/phase4a-stage.sh   # Phase 4a パスだけ git add（commit しない）
```

正本リスト: `scripts/phase4a-paths.manifest`（`orchestration.ts` は agent WIP 混入リスクのため除外）

> **注意:** `fix/phase4a-f7-pr` の履歴に agent/roster 系が残っている場合は、main から薄いブランチへ cherry-pick し直す。stage スクリプトは **作業ツリー** の分離のみ。

---

## P2 — F5 Core 厳格 marker

| 段階 | コマンド | 意味 |
|------|----------|------|
| Phase 4a ゲート | `npm run test:phase4a` | Wire / washout 必須緑（正本） |
| 全件（F7 分離後） | `npm test` | Core 厳格 cap 85 解除 |

`test:phase4a` 緑 ≠ Core 厳格解除。全件緑になるまで marker は failed のままで正しい。

---

## P3 — F8 / F9（変更なし）

- F8 maturity/CTR — 業務トラック · 偽 executed 禁止
- F9 Phase 4b — ADR 0004 どおり後追い

---

## 検証チェックリスト

- [x] `./scripts/mal-wire-hygiene.sh mal` → mail_config present · loopback present · trust は UPDATE 時のみ
- [x] `npm run test:phase4a`（43 tests · 2026-07-12）
- [x] `npm test` → marker `passed: true` · OpenOrgOS Core 厳格 100/100
- [x] `./scripts/mal-ship-gate-check.sh mal`（既存証跡）
- [x] `ORGOS_LIVE_VERIFY=1 ORGOS_LIVE_VERIFY_STRICT_EMAIL=1 ./scripts/wire-live-verify.sh mal check`
- [x] `ORGOS_LIVE_VERIFY_ROUNDTRIP=1 PHASE4_SMTP_WAIT_MS=90000 ./scripts/wire-live-verify.sh mal live`
- [x] 薄い PR: `origin/feat/agent-catalog-ops-landing` + `scripts/phase4a-paths.manifest` 範囲のみ

### Live 証跡（パスのみ · 秘密なし）

| 種別 | パス |
|------|------|
| check | `scratch/wire-live-verify-mal-2026-07-12T05-20-24-500Z.json` |
| live roundtrip | `scratch/wire-live-verify-mal-2026-07-12T05-25-24-514Z.json`（`email_wire_roundtrip` PASS） |

**注意:** Vitest と並行すると `delivery-attempts` が消え roundtrip が偽陰性になることがある。preserve + rehydrate で緩和済み。live 前は可能な限り Vitest 停止。全件は `./scripts/run-full-test-isolated.sh`。

残課題 F8 / F9 / Phase 5: [phase4a-open-tracks.md](phase4a-open-tracks.md)
