# docs/org-os — 組織 OS · 法域拡張

**用語正本:** [orgos-vocabulary.md](orgos-vocabulary.md) — **OrgOS = 製品** · **Steward Agent = 経営統括 Agent** · Core · Wire · Witness

**OrgOS（組織 OS）** = 製品全体（旧ドキュメントの「Steward OS 製品」に相当）。  
本リポジトリ `OS_Steward` / npm `orgos-reference` は **OrgOS の参照実装** — CLI **`orgos`**（旧 `steward` 非推奨 · [cli-migration.md](cli-migration.md)）。

## 設計原則

| 文書 | 内容 |
|------|------|
| [openorg-ooo-basic-philosophy.md](openorg-ooo-basic-philosophy.md) | **OpenOrg / OOO 基本思想**（2026-07-06）— State · Event · 会社ルール · 意味論的相互運用 |
| [orgos-vocabulary.md](orgos-vocabulary.md) | **用語正本** — OrgOS · Core · Wire · Witness · Agent |
| [openorgos-core-philosophy.md](openorgos-core-philosophy.md) | **OpenOrgOS Core Philosophy**（英語正本）— inter-org protocol · kernel · adapters |
| [language-policy.md](language-policy.md) | **Language tiers** — Core EN · Strategic · Community-supported |
| [layer-mapping-steward-os.md](layer-mapping-steward-os.md) | 本リポジトリの 4 層対応 · Core drift 一覧 |
| [orgos-completion-plan.md](orgos-completion-plan.md) | **OrgOS 完成度向上計画** — ORG-C0–C5 |
| [orgos-scoring-methodology.md](orgos-scoring-methodology.md) | **採点正本** — チェックリスト vs 厳格 · 批判対応マップ |
| [orgos-interface-spec.md](orgos-interface-spec.md) | Implementation / Adapter / Wire 境界（草案） |
| [wire-gateway-requirements.md](wire-gateway-requirements.md) | **Wire Gateway v0.2** — 唯一外部公開 · WG-0 完了 |
| [wire-gateway-wire-protocol.md](wire-gateway-wire-protocol.md) | **Wire Protocol v0.1** — WireMessage · 外部 HTTP · 署名 |
| [wire-gateway-internal-api.md](wire-gateway-internal-api.md) | **Internal API** — Core ↔ Gateway 契約 |
| [wire-gateway-export-policy.md](wire-gateway-export-policy.md) | **Pull エクスポート** — WG-2 許可判断 |
| [org-approval-schema.md](org-approval-schema.md) | **Org 承認根幹** — `scope: internal \| wire` · pending-approvals SoT |
| [passkey-iphone-qr-implementation-plan.md](passkey-iphone-qr-implementation-plan.md) | **iPhone PassKey（業界標準 QR）** — 他社調査と OOO 実装計画 |
| [inter-org-operator-model.md](inter-org-operator-model.md) | **Operator + CEO 承認ゲート** — Steward は組織間送信しない |
| [inter-org-two-org-demo.md](inter-org-two-org-demo.md) | **2 組織デモ** — mal ↔ southwood · `npm run demo:inter-org` |
| [wire-console-plan.md](wire-console-plan.md) | **Wire Console** — SPA + localhost BFF · outbox/inbox 可視化 · 運用 UI チケット |
| [receipt-qr-spec.md](receipt-qr-spec.md) | **QR 領収書** — 発行 · Wire amount-free claim · 公開 verify |
| [expense-claim-spec.md](expense-claim-spec.md) | **社内経費精算** — gate · 承認 · 弁済（実装後追い正本） |
| [org-budget-delegation.md](org-budget-delegation.md) | **予算委譲** — 全社→部門→個人 · ADR 0027 |
| [org-chart.md](org-chart.md) | **実組織図** — `org-chart.yaml` · Agent カタログ図との区別 |
| [llm-worker-pool.md](llm-worker-pool.md) | **LLM Worker Pool** — ローカル優先 · ADR 0034 |
| [chat-command-router.md](chat-command-router.md) | **Chat Command Router** — 決定論 CLI · ADR 0035 |
| [aia-parallel-runtime.md](aia-parallel-runtime.md) | **AIA 並行** — soft 10 / target 20 / hard 30 · ADR 0040 |
| [steward-orchestration-uplift-plan.md](steward-orchestration-uplift-plan.md) | **Steward オーケストレーション** — WO DAG · state machine · ADR 0044 |
| [aia-workspace-isolation.md](aia-workspace-isolation.md) | **AIA 作業スペース隔離** — scratch/aia-runs |
| [module-messaging.md](module-messaging.md) | **モジュール間メッセージ** — ModuleMessage · agent_relay |
| [integration-agent.md](integration-agent.md) | **Integration Agent** — 横断統合 · 正データ非編集 |
| [passkey-production-security-plan.md](passkey-production-security-plan.md) | **PassKey 本番 harden** — Wave 1 実装 · Wave 2 bootstrap（ADR 0039） |
| [inter-org-three-org-demo.md](inter-org-three-org-demo.md) | **3-org Wire デモ** — CLI + Console 手順 |
| [resilience-stack.md](resilience-stack.md) | **Resilience R1–R4** — relay worker · multipath · Org C trust PKI · SLA |
| [witness-hub-requirements.md](witness-hub-requirements.md) | **Witness Hub** — digest のみ · 分散プール · quorum |
| [witness-hub-operations.md](witness-hub-operations.md) | Hub デプロイ · バックアップ · CLI |
| [demo-docker.md](demo-docker.md) | **Demo All-in-one Docker** — 利用者獲得 · Phase 0〜4 · 本番禁止 |
| [witness-hub-governance.md](witness-hub-governance.md) | **Model Y** — Hub **仮計画 §7.A** · **最終系 §7.B**（IE/TR · n=8）· タリン Treasury |
| [gov-gateway-adapters.md](gov-gateway-adapters.md) | **Gov Gateway** — X-Road · e-Gov · Georgia 3G を Wire でラップ |
| [gov-gateway-adapters-survey.md](gov-gateway-adapters-survey.md) | **Gov Gateway 各国調査** — Hub 国 + 米中港新豪欧露印 + AF pool |
| [memos/README.md](memos/README.md) | **Gov Gateway 国別メモ** — 通信規格調査のメモ正本 |
| [org-dissolution-witness-checklist.md](org-dissolution-witness-checklist.md) | **Org 解散** — witness export · custodian 引渡 |

## 読む順

| 順 | 文書 | 内容 |
|----|------|------|
| 0 | [openorg-ooo-basic-philosophy.md](openorg-ooo-basic-philosophy.md) | **なぜ OpenOrg か** — Event / State / 会社ルールの分離 |
| 0a | [openorgos-core-philosophy.md](openorgos-core-philosophy.md) | 何を Core に置くか · 判断基準（英語正本） |
| 0b | [orgos-completion-plan.md](orgos-completion-plan.md) | **完成度向上計画** — 単独 OrgOS · 形式統一 · ORG-C0–C5 |
| 1 | [tjs-11-target-jurisdictions.md](tjs-11-target-jurisdictions.md) | **製品ゴール** — TJS-11 分母 · pack_ready DoD · 三軸評価 |
| 2 | [jurisdiction-pack-contract.md](jurisdiction-pack-contract.md) | テナント bind · pack 構成 |
| 3 | [jurisdiction-matrix.md](jurisdiction-matrix.md) | Corporate Core 写像 · 調査表 |
| 4 | [jurisdiction-oss-governance.md](jurisdiction-oss-governance.md) | OSS 分離 · CODEOWNERS |

## 実装正本

| パス | 役割 |
|------|------|
| `steward/jurisdictions/` | 索引 · countries.yaml · packs.lock |
| `steward/jurisdiction-packs/` | bundled pack 実体 |
| `steward/locale/registry.yaml` | 表示言語（法域と独立） |
| `src/lib/jurisdiction.ts` · `locale.ts` | 解決ロジック |

## 評価

完成度は [framework-assessment.md](../framework-assessment.md) §13 · 採点正本 [orgos-scoring-methodology.md](orgos-scoring-methodology.md) · バックログ [framework-backlog.md](../framework-backlog.md) Phase ORG-C。
