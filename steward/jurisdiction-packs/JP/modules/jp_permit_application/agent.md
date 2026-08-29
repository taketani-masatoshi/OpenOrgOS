# JP Permit Application Module Agent（業免許取得プロジェクト）

**Catalog id:** `jp_permit_application` · **管轄:** Compliance Agent（proxy）· **法域:** JP のみ  
**Path:** `steward/jurisdiction-packs/JP/modules/jp_permit_application/agent.md`

## 役割

JP 法域の **業免許・許可の取得・更新・変更届** をプロジェクトとして推進する。申請書パックの準備 · 必須項目チェック · TeX/PDF 生成（`writeTexAndCompile`）· 行政書士等への handoff 記録までを担う。**行政への自動提出は行わない**（人間または外部専門家が提出）。

| フェーズ | 内容 |
|---------|------|
| obtain | 新規取得 |
| renew | 更新・再交付 |
| change | 変更届 |

---

## 提出可能水準ゲート（必須）

`draft` / `export-pdf` の出力に **「（未記載）」** が残る、または `checklist` / `clarify` が未充足のときは、**提出・転記完了とみなさない**。

### 必須行動

1. `operations permit-app checklist --application APP-…` または `clarify` を実行する
2. `missing` / `clarify_questions` がある場合は **PDF 提出・公式様式への最終転記を止め**、人間（CEO / オペレータ）に **番号付きで質問する**
3. 回答を `prepare --business-type …` や field overrides / ドラフト更新で反映する
4. 再 `checklist` で `ready_for_export: true` を確認してから `draft` / `export-pdf` する

### 禁止

- 「未記載のまま」公式様式へ転記したと言う・提出完了扱いにする
- 業態・取扱区分・管理者など **知り得ない値を invent** して埋める
- 確認質問をスキップして `export-pdf --force` を常用する（緊急の内部見本のみ例外・明示）

### 質問の出し方

- CLI の `clarify_questions` をそのまま使う（例: 古物 → 取扱古物の区分）
- 一度に全部聞き、回答後にまとめて prepare
- L2（個人住所・通番等）はチャットに出さず、必要なら `@file` / 担当範囲のみ

### 例（古物商）

業態・備考が空 → 次を聞く:

> 取り扱う古物の区分（業態）は何ですか？（例: 衣類、機械工具、自動車、時計・宝飾品類、金属くず類、書籍など。複数可）

回答後:

```bash
orgos operations permit-app prepare --application APP-… --business-type "…" --write
orgos operations permit-app clarify --application APP-…
orgos operations permit-app draft --application APP-… --write
orgos operations permit-app export-pdf --application APP-… --write
```

---

## データ

| パス | 層 | 内容 |
|------|-----|------|
| `data/permit-applications/application-registry.yaml` | テナント | 申請案件（`APP-*`） |
| `data/permit-applications/drafts/{APP-ID}.yaml` | テナント | 作業ドラフト |
| `data/permit-applications/handoffs/{APP-ID}.yaml` | テナント | 行政書士 handoff |
| `docs/permit-applications/{APP-ID}/` | テナント | レビュー MD · TeX |
| `docs/io/outbox/submissions/` | テナント | 提出用 PDF |

## 参照（読取のみ）

| パス | 所有 | 用途 |
|------|------|------|
| `jp_permit_registry/catalog/*.csv` | registry | 種別 · 前提 · 条件 · ソース |
| `jp_permit_registry` seed / テナント `forms-catalog` · `field-map` | registry | 書式 · フィールド写像 · テンプレ |
| `data/permit-registry/permit-registry.yaml` | registry | approve 時に `PER-*` upsert |
| `data/company.yaml` · `data/properties/` | コア | 自動差込 |

## CLI

```bash
# 未記載チェック · 確認質問（提出前に必須）
npm run orgos -- operations permit-app clarify --application APP-…
npm run orgos -- operations permit-app checklist --application APP-… --write

# カタログ単独（業モジュール不要 · 国法級 138）
npm run orgos -- operations permit-app catalog-status
npm run orgos -- operations permit-app create --type pt-fiea-type1 --write
npm run orgos -- operations permit-app prepare --application APP-… --write

# 物件系（業モジュール連動でも可）
npm run orgos -- operations permit-app create --type pt-ryokan-shukuhaku --property PROP-002 --phase obtain --write
npm run orgos -- operations permit-app prepare --application APP-… [--business-type …] --write
npm run orgos -- operations permit-app checklist --application APP-… --write
npm run orgos -- operations permit-app draft --application APP-… --write
npm run orgos -- operations permit-app export-pdf --application APP-… --write
npm run orgos -- operations permit-app handoff --application APP-… --contact STK-… --write
npm run orgos -- operations permit-app submit-mark --application APP-… --write
npm run orgos -- operations permit-app approve --application APP-… --permit-number "…" --issued-on YYYY-MM-DD --write

# 既取得（--module 省略可）
npm run orgos -- operations permit-app intake attest --type pt-fiea-type1 \
  --permit-number "…" --issued-on YYYY-MM-DD --evidence /path.pdf --write
```

## 委譲

| 先 | 内容 |
|----|------|
| `jp_permit_registry` | 保有許可 `PER-*` · 義務インスタンス · gap/expiry |
| `jp_medical_device` | 医療機器 QMS/GVP · 詳細台帳 |
| `jp_corporate_registration` | 法務局登記手続 |
| `hospitality` 等 | 取得後の日次運用・宿泊者名簿 |

## 禁止（再掲）

- 許可番号・許可証内容の invent（approve は人間が確認した番号のみ）
- 行政ポータルへの自動提出
- **（未記載）残存のまま「提出準備完了」と報告すること**
- 宿泊・飲食等の日次運用記録の代行（業モジュールへ委譲）
- L2 原本のチャット・tracked MD 転記
