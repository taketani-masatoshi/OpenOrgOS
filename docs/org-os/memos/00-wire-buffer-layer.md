# メモ: Wire 緩衝層（Buffer Zone）

**調査日:** 2026-07-07  
**関連:** [wire-gateway-requirements.md](../wire-gateway-requirements.md) · [gov-gateway-adapters.md](../gov-gateway-adapters.md) · [orgos-vocabulary.md](../orgos-vocabulary.md)

---

## 背景

各国の政府系通信規格は **単一規格に統一できない**（調査メモ `countries/` 参照）。X-Road · e-Gov · SMEV · AS4 · OAuth/FAPI · 国标 GB/T 等が混在する。

Org 実装が各国形式に直接依存すると、**approve ロジック · audit · 越境取引** が規格変更のたびに壊れる。

---

## 緩衝層の役割

```
Org Implementation（I2）
        │
        ▼
┌───────────────────────────────┐
│ Wire — EventEnvelope 正本      │  ← 組織間の「中立地帯」
│ approve → outbox → audit-chain │
└───────────────────────────────┘
        │
        ├─ I3-a  Org P2P
        ├─ I3-b  Gov Gateway Adapter（国境のショックアブソーバー）
        └─ I3-c  Hub Witness（digest 証明）
        ▼
   各国バラバラの政府インフラ
```

---

## 不変条件（メモ）

1. **正本は常に `EventEnvelope`** — 国家形式は輸送用ビュー  
2. **approve は国家配送の前** — 内部合意と外部配送を分離  
3. **国家 GW 失敗で Wire 承認をロールバックしない**  
4. **Hub / 国家 GW は editor ではない** — append-only · digest 検証  

---

## 実装方針

- **Adapter ファミリー** で encode/decode コアを再利用（例: X-Road → EE + DJ）  
- Org は `protocol notice approve` まで同型 · 接続先は `gov-gateway.yaml` でテナント設定  
- profile YAML は `steward/jurisdiction-packs/{CC}/protocol/` に配置（草案パスのみ登録済みが多い）
