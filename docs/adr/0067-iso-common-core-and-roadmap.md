# ADR 0067 — ISO 共通統制は条項番号ではなく「仕事の型」で持つ

- **Status:** Accepted
- **Date:** 2026-08-29
- **補完:** [ADR 0066](0066-iso-internal-audit-control-maps.md)（内部監査は単一 Agent が control-map を読む）

## 背景

12 規格のパックを並べたところ、HLS（Annex SL）の器が規格ごとに複製されていた。
`4.1 · 5.2 · 6.1 · 7.5 · 8.1 · 9.2 · 9.3 · 10.2` の8統制は、id・title・domain 以外が
バイト単位で同一のものが7規格ぶんあり、旧来の5規格も同じ仕事を別 ID で持っていた。

規格を1つ足すたびに同じ器を書き直す構造になっていて、次の問題があった。

1. 内部監査を1回やっただけで、規格の数だけ成熟度を更新しないといけない
2. ISO の改定で条項番号が動くと、統制 ID とテナントの成熟度履歴が切れる
3. ISO 13485 は HLS 以前の構成で番号がそもそも違う（内部監査 8.2.4 · MR 5.6）
4. 未実装の ISO を置く場所がなく、「検討中」がカタログから見えない

## 決定

### 1. 共通統制は `work` をキーにする

`steward/standards/iso/core/control-map.yaml` に `CTL-CORE-{work}` を10件置く。
条項番号は持たない。各規格パックが `core_bindings` で自分の番号をコアに結ぶ。

```yaml
# ISO-13485/control-map.yaml
core_bindings:
  - work: internal_audit
    clause: "8.2.4"
  - work: management_review
    clause: "5.6"
```

ローダは有効な規格のバインディングを `work` ごとに集約し、`iso_refs` を組み立てる。
バインドが1件も無い `work` のコア統制は出さない（孤児を作らない）。

### 2. `iso_refs.edition` はカタログの `year` から付与する

条項番号は版とセットでないと意味がない。`edition` を loader が catalog から stamp する。
マップに手で書かない — 版が上がったらカタログ1箇所で直る。

### 3. 折り畳んでもギャップは隠さない（`evidence_mode`）

リスクは全規格に共通する**プロセス**だが、**方法と証拠**は領域ごとに違う
（27001 の SoA · 13485 の ISO 14971 リスクファイル · 45001 の危険源）。

`evidence_mode: all` を導入し、コアに畳んだ統制は **有効な規格ごとの証拠が全て**
揃って初めて充足とする。`any`（既定）は監査計画や MR 議事録のような共有成果物に使う。

これがないと「27001 のリスク登録があるから 9001 のギャップが消える」が起きる。

### 4. 領域メソッドはコアに入れない

コアに入るのは器だけ。次は各パックに残す。

- 27001 適用宣言書（SoA）· 27001 Annex A
- 13485 設計管理 · UDI · 当局報告 · 苦情
- 45001 危険源 · 22301 BIA · 22000 HACCP · 50001 EnPI · 20000 SLA/CMDB · 37001 贈収賄リスク · 14001 環境側面
- 37000 は `kind: guidance`。P-01…P-11 は自己宣言のままでコア対象外

### 5. 移行は `supersedes` で成熟度を引き継ぐ

コア統制は畳んだ旧 ID を `supersedes` に列挙する。`orgos controls migrate-core` が
旧 ID 群の**最大成熟度**をコアへ引き継ぎ、`last_reviewed` は最新日、`notes` は結合する。
既定は dry-run。MAL では 28 の旧 ID が 9 件のコア統制になり、内部監査の L3 が保たれた。

### 6. カタログに `status` を入れ、Coming Soon を作る

`available` / `coming_soon` を導入した。`coming_soon` は:

- `verifyIsoMaps` / doctor で **skip**（フォルダ欠落を失敗にしない）
- `standards.yaml` で**有効化できない**（`orgos iso roadmap` を案内して拒否）
- 内部監査の対象に入らない

`orgos iso scaffold <id>` が `core_profile` からパック雛形を生成し `available` に昇格する。
領域統制は人間が書く。雛形は器だけを作る。

`kind` に `control_set`（27002/27017/27018）と `sector_extension`（14064/10002）を足した。
これらと `guidance`（31000/19011）は単独 MS ではないため scaffold を拒否する。
31000 と 19011 はコアの `guidance_refs` から参照する。

## 帰結

**良くなること**

- 規格の追加が「カタログ1行 + 雛形生成 + 領域統制の記述」に収まる
- 内部監査を1回やれば全規格に効く（成熟度が仕事側にある）
- ISO 改定で番号が動いても、直すのは `core_bindings` の1行だけ
- 未実装の ISO が Tier 付きで見える

**代償**

- `CTL-9001-9.2` のような直感的な ID が消える。旧 ID は `supersedes` からのみ辿れる
- ローダに合成の一段が増える（`synthesizeCoreControls`）
- `evidence_mode: all` は規格を足すとギャップが増える。これは意図した挙動で、
  「有効にしたが証拠が無い」を沈黙させないための設計

**例外**

`CTL-CORE-privacy` は共通の仕事ではないが、コア導入前から使われていて
テナントの成熟度履歴を持つため ISO-27001 パックに ID のまま残した。
テストは明示的な legacy 許可リストで固定している。ISO 27701 が `available` になったら
そちらへ移す。

## 参照

- 実装: `src/lib/control-framework.ts`（`synthesizeCoreControls`）· `src/commands/controls-migrate-core.ts` · `src/commands/iso-scaffold.ts`
- スキーマ: `schemas/control-framework.ts` · `schemas/iso-catalog.ts`
- テスト: `tests/iso-core-module.test.ts` · `tests/iso-pack-contract.test.ts` · `tests/iso-module-add.test.ts` · `tests/iso-coming-soon.test.ts`
- 正本: `steward/standards/iso/core/00-このフォルダについて.md`
