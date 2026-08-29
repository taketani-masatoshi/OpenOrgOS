# ADR 0012: ビジネスモジュールと行許可（Compliance）取得の責務分離

**状態:** Accepted  
**日付:** 2026-07-14  
**決定者:** OpenOrgOS コアメンテナ  
**親 ADR:** [0011](0011-jp-permit-application-vs-registry.md)（取得プロジェクト ↔ 保有台帳）

---

## Context

業の開始・継続には行許可（許可・認可・登録・免許・指定等）が前提になる。これを業モジュール内で「申請も運用も台帳も」抱えると、次が起きる。

- readiness / Today が「運用可能」と「免許取得済」を混同する
- 申請書・行政手続の知識が業モジュールに散在し再利用できない
- 海外の認証（ISO · CE · FDA 等）へ同じパターンを広げられない

よって **「何が必要か」** と **「どう取得・維持するか」** を疎結合にする。

## Decision

### 1. 三層モデル（現行実装への写像）

```
Business Module（業・Capability）
        │  Required Compliance（要件定義 · 読取専用の状態表示）
        ▼
Compliance Fulfilment（種別ごとにモジュール）
        ├─ License / Permit  → jp_permit_application（取得プロジェクト）
        │                   + jp_permit_registry（保有・期限・義務 SSOT）
        ├─ Certification     → 将来（ISO · ISMS · CE 等）
        ├─ Registration      → 一部は jp_corporate_registration 等
        └─ Inspection        → 将来
        │
        ▼
Government / Assessor
```

| 層 | 知るべきこと | やってはいけないこと |
|----|--------------|----------------------|
| **Business Module** | どの Capability にどの Compliance が必要か · 必須/任意 · 根拠法・所管・参考 URL への参照 | 申請書作成 · 行政提出 · 許可番号の invent · `PER-*` 直書込 |
| **License（行許可）系** | 申請・補正・許可証・更新・変更・廃止の手続と証跡 | 業の日次運用データ（名簿・売上・OTA 等）の所有 |
| **Registry 台帳** | 取得状態の **SSOT**（未取得 / 申請中 / 取得済 / 期限切れ 等） | 業固有の運用判断の代替 |

### 2. Required Compliance の所有

- **宣言の正本**は法域カタログおよび業モジュールの要件宣言に置く。
  - 現状: `permit-types.csv` の `binds_module` · `MODULE_REQUIRED_PERMIT_ANY_OF`（G-01）· capability catalog の `binds_modules`
  - 目標: 業ごとの `required_compliance[]`（`compliance_type_id` · severity · 参照 URL）を YAML/カタログで明示
- **状態の正本**は常に Fulfilment 側（行許可なら `PER-*` / `APP-*`）。
  - Business Module は状態を **表示・ゲート判定に解決するだけ**であり、ステータスを独自マスタとして持たない。

状態語彙（表示用 · registry/application から導出）:

| 表示 | 導出の目安 |
|------|------------|
| 未取得 | 該当 `PER-*` なし · または draft |
| 申請中 | 進行中 `APP-*` あり · `PER-*` が pending 等 |
| 取得済 | `PER-*` status = `active` |
| 更新期限切れ | `active` だが `expires_on` 超過、または更新 `APP-*` 未着手 |

### 3. 行許可取得モジュールの範囲

`jp_permit_application`（＋行政書士 handoff）が担当する:

- 申請書作成 · 添付 · 提出物 outbox · 審査状況（案件 status）· 補正メモ · 許可証パス保管トリガ · 更新/変更/廃止のプロジェクト化

**非ゴール（当面）:** 行政 API への自動電子申請代行（手動提出 · handoff を正とする。電子手続 URL はカタログで管理）。

標準ドメインイベント（Event First · 実装は段階的）:

`LicenseApplicationStarted` · `DocumentUploaded` · `ApplicationSubmitted` · `CorrectionRequested` · `LicenseGranted` · `LicenseRenewed` · `LicenseModified` · `LicenseExpired` · `LicenseRevoked` · `LicenseClosed`

（grant 時に registry へ `PER-*` upsert — ADR 0011 Decision 5）

### 4. Compliance Requirement への一般化（将来）

「行許可」に閉じず、抽象 **Compliance Requirement** を定義する。

| Compliance Type 例 | Fulfilment モジュール（将来含む） |
|--------------------|----------------------------------|
| 行許可 · 登録 · 認可 · 指定 | `jp_permit_*` |
| ISO / ISMS / CE / FDA 等 | Certification Module（未実装） |
| GVP · GMP · QMS 体制 | 専門モジュール（例: `jp_medical_device` が詳細正本）＋許可案件は permit-app がリンク |
| 法人登記 | `jp_corporate_registration`（許認可外だが同じ「取得プロジェクト」パターン） |

Business Module は **Requirement の宣言のみ**。Type ごとの Fulfilment が取得・維持・更新を担当する。

### 5. 疎結合ルール（MUST）

1. Business → Fulfilment: Requirement id / permit_type_id 参照のみ（手続詳細をコピーしない）
2. Fulfilment → Business: `active` / 期限 / ブロッカー信号のみ（運用データの書戻し禁止）
3. 開業・継続ゲート（G-01）は Fulfilment SSOT を読み、Business の启用だけで「取得済」とみなさない
4. 国際展開時も同じ矢印（Requirement → Type → Fulfilment）を維持する

## Consequences

### Positive

- ADR 0011 の取得↔台帳分離を、**業モジュール側の要件宣言**まで一貫した原則に拡張できる
- ISO / 海外認証を足しても Business Module の形を変えにくい
- Today / readiness の説明責任が「要件未充足」対「運用不備」に分かれる

### Negative / トレードオフ

- Certification / Inspection の案件深度（補正・廃止・品目紐付け）は許可モジュールより薄いが、取得・更新・ゲートは接続済
- 自動電子申請は非ゴールのため「電子申請」は URL・手順管理まで
- company-event の slug 長制限のため application id は短縮される場合あり
- License 標準イベント列挙のうち、業務パスが無いもの（Revoked 等）は未配線（意図的）

## 現行との対応（2026-07-14）

| 設計上の概念 | 現行の置き場 |
|--------------|--------------|
| Business Module | `hospitality` · `jp_medical_device` · `real_estate_brokerage` 等 |
| Required Compliance | **`{module}/required-compliance.yaml`**（正本）· G-01 が読取 · CLI `permit-app requirements` |
| Activate → intake | `modules activate` が `notifyPermitModuleOnActivate` · `permit-app intake plan|attest|start-app` |
| License application | `jp_permit_application` · lifecycle → `createCompanyEvent(kind: compliance)` |
| Pre-existing evidence | `docs/company/licenses/records/` + INDEX.csv · PER `evidence_path` |
| License ledger / status SSOT | `jp_permit_registry`（`PER-*`） |
| Certification Fulfilment | `jp_certification` · start/attest/grant/renew/scan-expiry/gate |
| Inspection Fulfilment | `jp_inspection` · schedule/complete/gate |
| Catalog（根拠法・所管・URL） | `jp_permit_registry/catalog/*.csv`（国法級 ~138） |

`MODULE_REQUIRED_PERMIT_ANY_OF` は宣言ファイル欠落時の **フォールバックのみ**（deprecated）。

G-01 は `severity: required` の license / certification / inspection を充足判定する（`recommended` は非ブロック）。

## 関連

- [0011-jp-permit-application-vs-registry.md](0011-jp-permit-application-vs-registry.md)
- [jp-permit-application-requirements.md](../org-os/jp-permit-application-requirements.md)
- [jp-permit-catalog-coverage.md](../org-os/jp-permit-catalog-coverage.md)
- [module_contract.md](../../steward/modules/module_contract.md)
- [0005-event-first-standard-patterns.md](0005-event-first-standard-patterns.md)
