# Skill: schedule_coordination（多者日程調整）

**runtime:** `cli` · **Agent:** Secretary（主）· Mail Intake / Mail Outbound（連携）

## 目的

メール往復による **多者日程調整** を案件として管理し、候補提示から Google Calendar / Meet 反映、参加者別の確定通知送信までを Secretary が指揮する。他社カレンダーは参照せず、返信メールを正本とする。

## 正本

| データ | パス |
|--------|------|
| 調整案件 | `data/executive/scheduling-cases.yaml` |
| 社長カレンダー | `data/executive/calendar.yaml` |
| 受信トリアージ | `data/executive/mail-triage-queue.yaml` |

## ワークフロー

1. **案件作成** — `executive scheduling new`
2. **候補生成** — 社長カレンダー空きから `executive scheduling propose`
3. **初回提案** — 社外参加者ごとの個別 draft を自動起案（内部参加者は必要時のみ Cc）→ Mail Outbound 承認・送信
4. **返信取込** — Mail Intake sync 後 **自動** `auto-process`（Phase 3）
5. **リマインド** — `reminder-poll`（mail sync 独立）または auto-process が期限到来案件を走査し、未回答の社外参加者ごとの draft を重複なく起案
6. **CEO 確認（2回目）** — 単一 choice（`schedule_ceo_choice`）で確定・再提案・中止。split/counter 例外も同じ1フィールド
7. **確定** — Calendar push 成功後、Meet URL / 場所入りの参加者別確定通知を起案し CEO 承認済みなら自動送信
8. **完了** — 全確定通知の送信完了フックを受けた時だけ `closed`（CEO 操作は候補送付承認 + 最終判断の2回）

初回候補送付を CEO が承認すると `proposal_send_authority` が記録され、counter による再提案（revision 増分・counter 2 回目まで）は同権限で自動承認・送信される。送信時に operator が disabled になっていた場合は権限を破棄し手動送付待ちに戻す。counter 3 回目（`schedule_counter_limit`）は委任対象外で CEO 手動判断のみ。

文案はテナント `rules/secretary_behavior.md` の **日程調整下書き** 節（結びの文言）を正本とする。

`contact_ref` は Secretary contact registry で解決する。未解決の外部参加者が1名でもいる案件は `needs_review` とし、送信可能扱いにしない。Calendar / SMTP の失敗および未送信通知は案件を閉じず、Today から再試行できる状態に残す。

## CLI

```bash
orgos executive scheduling new --title "..." --participant "名前|email|external"
orgos executive scheduling propose --id SCH-2026-001
orgos executive scheduling approve-send --id SCH-2026-001 --reviewed
orgos executive scheduling process --mail-id MSG-...
orgos executive scheduling rehearsal --full --tenant <id>
orgos executive scheduling draft --id SCH-2026-001 --write-draft
orgos executive scheduling process --all
orgos executive scheduling reminder-poll
orgos executive scheduling confirm --id SCH-2026-001 --slot-id SLOT-001 --write-calendar
orgos executive scheduling cancel --id SCH-2026-001 --reason "..."
orgos executive scheduling reschedule --id SCH-2026-001
orgos skills run schedule-coordination
```

**返信取込:** 本番は Mail Intake sync → `auto-process` / `process --mail-id`。`executive scheduling respond` は **dev/test のショートカット**（リハーサルでは EML 注入 + `process-mail` を使用）。

## 初回セットアップ

```bash
orgos tenant scaffold-data --tenant <id>
orgos doctor --tenant <id> --repair
orgos executive scheduling rehearsal --full --tenant <id>
```

`doctor --repair` は operator key · mail-config · approval registry を修復し、成功時に次コマンド（`rehearsal --full`）を表示する。

## 本番 vs dev/test 経路

| 段階 | 本番 | dev/test |
|------|------|----------|
| 初回セットアップ | `tenant scaffold-data` → `doctor --repair` | 同上 |
| 候補提案送信 | `approve-send --reviewed`（`--no-dry-run` で実 SMTP） | `approve-send`（既定 dry-run · `smtp.test.local`） |
| 返信取込 | Mail Intake sync → `auto-process` / `process --mail-id` | リハーサル: fixture EML → `process-mail` |
| CEO 最終確認 | Steward Chat / `mail intake ceo answer` | リハーサル: inline CEO answer |
| 完走確認 | `status=closed` · `orgos validate` | `rehearsal --full` 終了時アサーション |

**スコープ外（別検証）:** IMAP 本番 sync · Google Calendar/Meet OAuth 本番 · Steward Chat session 本番。

## Agent 分担

| 主体 | 役割 |
|------|------|
| **Secretary** | 案件 SoT · 候補 · 次アクション · カレンダー確定 |
| **Mail Intake** | 受信 · schedule 意図 · 返信パース · 案件紐付け |
| **Mail Outbound** | 送信下書き · 承認 · SMTP |

## 禁止

- 未承認メールの自動送信
- 他社カレンダーの直接参照（メール返信のみ）
- L2 メール本文の tracked MD 転記

## 関連

- [schedule_management.md](schedule_management.md) — 社長カレンダー読取
- [external_correspondence.md](external_correspondence.md) — 社外文案
- [mail_intake_triage.md](mail_intake_triage.md) — 受信分類
