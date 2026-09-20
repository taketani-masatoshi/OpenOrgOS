# e-Tax 認証チェックリスト（オペレータ証跡）

**正本:** 本ファイル · **スコープ:** 第一手続 **RHO0010** のみ · **日付:** 2026-09-21  
**定義:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) §「e-Tax対応完了（D1–D8）」 · ADR [0078](../adr/0078-etax-integration.md)

自動テスト（T-A*）は CI / Vitest。本表は **人間＋Windows** の証跡（T-O*）。  
対応完了は **T-A* 緑かつ T-O* 緑**、かつ `evaluateProductionEnablement().certified === true` のときだけ宣言する。

CAB は gitignore。`tenants/mal` は触らない。PIN / 秘密鍵を YAML・ログ・チャットに書かない。

---

## T-O オペレータ証跡

| ID | 手順 | 合格の証拠 | evidence パス（例） | 状態 |
|----|------|------------|---------------------|------|
| T-O1 | Windows に NTA 署名・送受信モジュール導入。`etax-host` が `SignToReport` / `Send` / `GetResponse` を呼ぶ | ホストログ（秘密なし）。catalog 実行時 `hostBound` がヘルス成功時のみ true | `data/etax/transmission-test/host-bind-log.txt`（gitignore） | 未実施 |
| T-O2 | `--env test` で RHO0010: build→validate→approve→sign→ready→submit→receipt | 実 受付番号（`MOCK-NOT-NTA-` でない）。ハッシュ付き記録 | `data/etax/transmission-test/test-submit-*.json` | 未実施 |
| T-O3 | NTA ソフトウェアベンダー送信試験の申請・実施 | NTA 試験完了の参照 ID + 日付（L1）。gate の `evidence_path` が実在ファイルを指す | `data/etax/transmission-test/nta-completion.txt` → `production-gate.yaml` の `evidence_path` | 未実施 |
| T-O4 | 本番 credential 分離 | test と production の `certificate_ref` が別。PIN が YAML/ログに無い監査サンプル | `data/etax/credentials/*.example` のみ tip。実鍵は gitignore | 未実施 |
| T-O5 | 人間レビュー（ceo/approver） | ADR 0038 subject `etax.production_enable` の承認 | org approval id → `orgos etax production release --approval-id` | 未実施 |
| T-O6 | バナー確認 | `orgos etax production review` が `certified=true`。submit `--env production` がゲート通過 | review JSON + 運用判断での実送信 | 未実施 |

---

## 機械的ゲート

```bash
orgos etax production review --json
# certified === true かつ blockers 空
# T-O2–T-O5 の evidence ファイルが揃っていること
```

`orgos etax production enable` は yaml を書かない（拒否）。  
**解放は** `orgos etax production release --approval-id <APR-*>` のみ（承認バインド済み・要件充足時）。

---

## 対応完了に含めないもの

- 消費税・所得税・源泉など他手続
- macOS 単独での本番提出（Windows COM が正）
- 税額の正しさ（`RECEIVED_BY_ETAX` ≠ 税務正しさ）
