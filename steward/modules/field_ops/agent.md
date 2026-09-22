# field_ops

**権限:** 提案まで。割当の apply、在庫減算、顧客通知は人間。`can_approve` と `can_execute` は false。[ADR 0079](../../docs/adr/0079-module-ai-permission-declaration.md)

GPS 軌跡は台帳に書かない。入力はスキル・空き・通過点。音声・写真バイトは拒否。報告の正本は `field-ops interface`（`intake` / `job complete` は互換エイリアス）。`field-ops analytics` は jobs.yaml の work/travel minutes を集計する。
