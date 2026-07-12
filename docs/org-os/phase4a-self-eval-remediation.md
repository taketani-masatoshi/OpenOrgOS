# Phase 4a 自己評価ギャップ — 対応策と実装

**Date:** 2026-07-12 · **Parent:** [phase4a-washout-f7-f10.md](phase4a-washout-f7-f10.md)

自己評価で減点した項目への **実装済み対策**。

---

## P0 — 鍵 / DID / mail-config / PEER-003 衛生

| 問題 | 対策 |
|------|------|
| Vitest 後に鍵・DID・mail-config がズレる | `tests/setup-restore-protocol.ts` が `wire-gateway.yaml` も preserve · restore 後に DID 再同期 + PEER-003 + mail-config 復元 |
| mail-config が Zone C で消える | 正本例: `deploy/mal-pilot/mail-config.mal-pilot.yaml.example`（tracked） |
| PEER-003 消失 → hash mismatch | `peers.yaml` に PEER-003 を SSOT 化 · hygiene が鍵と同期 |
| trust registry と鍵のズレ | hygiene が platform / publish の mal node を同期 |
| 鍵ファイル消失 | `.bak-*` から復元を優先し、無ければ新規作成 |

```bash
./scripts/mal-wire-hygiene.sh mal
# または
npm run orgos -- protocol wire-hygiene --tenant mal
```

Live / ship-gate 前に `wire-live-verify.sh` が hygiene を自動実行。

---

## P1 — F7 WIP 分離（実装）

```bash
./scripts/phase4a-stage.sh   # Phase 4a パスだけ git add（commit しない）
```

正本リスト: `scripts/phase4a-paths.manifest`

---

## P2 — F5 Core 厳格 marker

| 段階 | コマンド | 意味 |
|------|----------|------|
| Phase 4a ゲート | `npm run test:phase4a` | Wire / washout 必須緑 |
| 全件（F7 分離後） | `npm test` | Core 厳格 cap 85 解除 |

`test:phase4a` 緑 ≠ Core 厳格解除。全件緑になるまで marker は failed のままで正しい。

---

## P3 — F8 / F9（変更なし）

- F8 maturity/CTR — 業務トラック · 偽 executed 禁止
- F9 Phase 4b — ADR 0004 どおり後追い

---

## 検証チェックリスト

- [ ] `./scripts/mal-wire-hygiene.sh mal` → mail_config present · loopback present
- [ ] `npm run test:phase4a`
- [ ] `./scripts/mal-ship-gate-check.sh mal`
- [ ] `ORGOS_LIVE_VERIFY=1 ./scripts/wire-live-verify.sh mal check`
- [ ] （任意）`ORGOS_LIVE_VERIFY_ROUNDTRIP=1 ./scripts/wire-live-verify.sh mal live`
- [ ] PR 前: `./scripts/phase4a-stage.sh` → 差分レビュー
