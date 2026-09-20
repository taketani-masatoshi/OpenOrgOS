# openDesk 拡張の境界

**正本:** 本書 · **ADR:** [0078](../adr/0078-opendesk-first-connector-ports.md)

Core（本リポジトリ、Unlicense）に載せるのは API クライアントと verify compose の参照だけです。

| 置く場所 | ライセンス | 中身 |
|---|---|---|
| `src/lib/integrations/sovereign/` | Core と同じ | Matrix / Nextcloud / Keycloak / OX の HTTP クライアント |
| `src/lib/integrations/compat-ports.ts` | Core と同じ | Slack / Gmail / Drive / M365 の写し口 |
| `deploy/opendesk-verify/` | Core と同じ | 上流イメージを参照する compose。ソースは同梱しない |
| 将来 `openDesk-extension-ooo`（別パッケージ） | Apache-2.0 想定 | OpenCode へ出す連携コネクタ。センサーコード解析は含めない |

AGPL（Element / Synapse / Nextcloud）と GPL（OX backend）のソースを Core にコピーしない。センサーコード解析は自社秘匿で、この境界の外に置く。
