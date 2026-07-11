## Summary

<!-- 変更の目的（why）を1–3文で -->

## Test plan

- [ ] `npm test`（該当 tier があれば `npm run test:platform` 等）
- [ ] `npm run validate`（データ変更時）
- [ ] `npm run generated:check`（生成物 · policy ミラー変更時）
- [ ] `orgos operator sync-policy --emit all`（`steward/rules/` · `engineering/` 変更時）
- [ ] `orgos operator export --all`（Agent 定義変更時）

## Engineering Constitution（Definition of Done · §11）

- [ ] アーキテクチャ整合（SSOT · Catalog/Roster 混在なし）
- [ ] ビジネスロジックは `src/lib/` / CLI（LLM のみに依存しない）
- [ ] テスト追加 / 更新（Domain 可能な範囲）
- [ ] ドキュメント / ADR 更新（仕様変更時）
- [ ] 重複ロジック · デッドコード · TODO 残置なし
- [ ] L2/L3 を tracked MD · チャットに出力していない

正本: [steward/rules/engineering/](../steward/rules/engineering/00-このフォルダについて.md) · [ADR 0003](../docs/adr/0003-constitution-code-compliance-roadmap.md)
