# 日程調整 — 境界リファクタ計画（再検証版）

**作業場所:** `/Users/kk/OOO/Core-worktrees/scheduling-coordination-refactor`  
**ブランチ:** `cursor/scheduling-coordination-refactor`  
**基準コミット:** `194dfd18`（先行分割） / merge-base `main` ≈ `31dfeb3e`  
**正本:** Core product · 本ドキュメントは作業メモ（コミット対象外でも可）

---

## 0. ChatGPT静的調査との差分（検証結果）

| 指摘 | 検証結果 |
|------|----------|
| 37ファイル・6,194行 · lifecycle 574 · process-mail 523 | **古い。** 先行分割後は lib 46 + CLI 2 · 計約 6,317 行。`lifecycle.ts` は 26 行の再公開ハブ。`process-mail.ts` 337 · `draft-text` 371 · CLI 398。 |
| lifecycle が下書き〜送信まで一枚岩 | **既に解消済み。** `correspondence-drafts` / `lifecycle-events` / `correspondence-sent` / `delegated-send` に分割。 |
| process-mail が一枚岩 | **部分解消。** 照合=`mail-match` · 受付=`mail-intake`。**返信反映はまだ process-mail 内。** |
| next-action は純粋判定 | **一部後退。** 先行作業で `persistSchedulingNextAction`（store I/O）を `next-action.ts` に置いた。方針違反なので戻す。 |
| store の revision はプロセス間排他ではない | **正しい。** 同期 read-check-write のみ。今回は方式変更しない。 |
| calendar-write がローカル保存と外部 API をまたぐ | **正しい。** 失敗時 `calendar_sync=failed` · 再試行で synced に戻るテストあり。方式変更せず境界コメント整備のみ可。 |
| workflow が now を受けつつ内部で `new Date()` | **正しい（バグ寄り）。** `advanceSchedulingWorkflow` L102 が `now` を無視。 |
| 循環依存 | **lifecycle↔propose-case は解消済み。** workflow→ceo-confirm→lifecycle ファサードは一方向。分割先から旧集約への逆参照は lifecycle 再公開のみ。 |

---

## 1. 処理経路（現状）

```
CLI / Chat / mail poller
  → case-mutations | chat-intent | process-mail(+mail-match/intake)
  → applyNextAction (純粋) → updateSchedulingCase (永続)
  → correspondence-drafts / workflow (副作用: 下書き・CEO質問)
  → approve-send / delegated-send (承認・送信ゲート)
  → ceo-confirm → calendar-write (ローカル予定 → 任意 Google)
  → correspondence-sent (送信後遷移・権限記録・close)
```

**依存方向（目標）:**  
判定(`next-action`) ← 永続(`store` / persistヘルパ) ← アプリ流(`case-mutations` / mail / workflow) ← 副作用(下書き・送信・カレンダー)  
分割モジュールは `lifecycle.ts` ファサードへ依存しない（呼び出し側は段階的に直 import）。

---

## 2. 状態保存の差（統合しない）

| 関数 | 比較フィールド | 副作用 |
|------|----------------|--------|
| `persistSchedulingNextAction` | status · next_action · **exception_reason** | なし（保存のみ） |
| `advanceSchedulingWorkflow` 内の persist | status · next_action のみ | その後 clarify 下書き / CEO 質問 |

差を無視して1関数に統合しない。`advance` 側に `exception_reason` を足すかは、単独で exception だけ変わる経路があるかの確認後に判断（今回は時刻修正を優先）。

---

## 3. 段階計画

### ① 検証基準（実装前）
- 使い捨て worktree で `ORGOS_TEST_DISPOSABLE_ROOT=$PWD` · `npm run test:scheduling`
- 既存失敗があれば記録し、以降の回帰と区別

### ② next-action 純粋化 + workflow 時刻
- `persistSchedulingNextAction` を `persist-next-action.ts` へ移動（store + applyNextAction）
- `next-action.ts` から store import を除去
- `advanceSchedulingWorkflow` の `updated_at` に渡された `now` を使う

### ③ process-mail 返信段階
- 参加者更新・対案スロット・永続・counter 後の下書き/委任送信を `mail-reply.ts` へ
- `process-mail.ts` は入口・読込・ゲート・照合結果の分岐のみ
- 公開 API は `process-mail.ts` から再公開維持

### ④ カレンダー境界（最小）
- 方式変更なし。ローカル保存成功後に Google 失敗しうる順序を関数コメントで明示
- プロセス間ロックは別課題として報告のみ

### ⑤ CLI 分割
- **今回はしない**（表示+権限のみ · 業務契約維持優先）

### 取り消し
- 段階ごとに git で戻せる単位。schema / 依存追加なし。

---

## 4. 維持する業務契約（要約）

CLI I/O · ID/YAML · revision vs proposal_revision · メール紐付け・再処理防止 · 承認/RBAC/送信ゲート · 対案上限 · 会場順序 · リマインド · CEO 質問重複防止 · Calendar 未設定ローカル · 失敗再試行 · テナント分離。  
**人間承認・実 SMTP・実 Google は実行しない。** mock 成功 ≠ 実連携保証。

---

## 5. 完了条件

- 上記②③実装済み
- `test:scheduling` + 関連 uplift/chat 緑
- 変更前失敗との区別を報告
- commit/push しない（本指示）

---

## 6. 実施結果（この作業ツリー）

| 段階 | 状態 |
|------|------|
| ① 基準テスト | **検証済み** · 63/63 緑（変更前） |
| ② persist 切り出し · workflow `now` · exception_reason 比較揃え | **実装済み / 検証済み** |
| ③ mail-reply 分離 | **実装済み / 検証済み** · process-mail 173 行 |
| ④ calendar 順序コメント | **実装済み** · 方式変更なし |
| ⑤ CLI 分割 | **未実施**（計画どおり） |
| 変更後テスト | **検証済み** · scheduling 63 · uplift+chat 29 · eslint 対象ファイル 0 |
| commit/push | **未実施**（指示どおり） |
