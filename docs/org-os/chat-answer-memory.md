# Chat answer memory

過去のクラウド（およびローカル）LLM 回答を派生索引し、次のローカル LLM 呼び出しの **参考ブロック** として system に注入する。

**正本:** テナント `data/chat/threads/*.json`  
**派生:** `data/chat/answer-memory/index.json`（gitignore · `orgos chat memory reindex` で再構築）  
**ADR:** [0059-chat-answer-memory.md](../adr/0059-chat-answer-memory.md)

## 無効化

```bash
export ORGOS_CHAT_ANSWER_MEMORY=0
```

または `data/chat/settings.json`:

```json
{
  "max_turns": 10,
  "answer_memory": {
    "enabled": false,
    "ttl_days": 30,
    "max_hits": 2,
    "min_score": 0.35
  }
}
```

## CLI

```bash
orgos chat memory reindex
orgos chat memory reindex --json
orgos chat faq build
```

## Docker 統合スタック（:9470）での反映

Community の `docker-compose.operator.yml` は **ホストの dist をマウント**する。

| パス | 役割 |
|------|------|
| `OS_Steward/apps/steward-chat/dist` | SPA（Good/Bad・FAQ UI） |
| `OS_Steward/packages/orgos-cli/dist` | BFF（`/chat/v1/feedback` 等） |

ソースだけ変えても画面に出ない。次のいずれかが必要:

```bash
# 手動
cd /path/to/OS_Steward
npm run operator-console:build
npm run build:package
cd /path/to/OS_Community
./scripts/start-local-stack.sh --ensure   # dist が古ければ自動ビルド + console recreate
```

`start-local-stack.sh`（`--up` / `--ensure`）は起動前に SPA/CLI の mtime を見て古ければホストでビルドする。ブラウザは **ハードリロード**（`assets/` は immutable）。

## 運用メモ

- 数値・KPI は従来どおり Fact Provider / Today が先に答える（メモリは見ない）。
- メモリは手順・方針・言い回し向け。古い数字をコピーしないよう grounding 文を付けている。
- **Good / Bad** — 各 assistant 返信の下のボタン（LLM・決定論・FAQ いずれも `assistant_turn_id`）。Bad は同一 Q&A の再利用を止める。Good は FAQ 索引に載せる。
- **FAQ 索引** — Good 評価の完全一致は LLM をスキップして即答。チャットフッタ / 設定画面 / `POST /chat/v1/faq/build` / `orgos chat faq build`。`ORGOS_CHAT_FAQ_IDLE_MS`（既定 5 分）のアイドル後に自動更新。
- Community 側に会話ストアは無い。再利用は Operator Console（OS_Steward）上のみ。
