# テナントの退避と履歴リモート

最新の正本はこのマシンのテナントディレクトリです。NAS は復元用のコピーで、作業ディレクトリにはしません。GitHub には実テナントを出しません。

## 退避

`data/org/backup-target.yaml`（見本は `tenants/_template/data/org/backup-target.yaml.example`）:

```yaml
version: 1
destination: /Volumes/OrgNAS/orgos-restore/REPLACE_TENANT
volume_encrypted: true
```

`volume_encrypted: true` は、退避先のボリュームが既に暗号化されているという宣言です。アーカイブ自体の暗号や鍵管理は作りません。宣言が無い設定ではスナップショットしません。

| コマンド | 動き |
|---|---|
| `orgos tenant backup status` | 設定とスタンプの古さ。終了コードは 0。未達は警告で、成功したことにはしない |
| `orgos tenant backup snapshot` | テナントを `tar.gz` にして destination へ置く。成功したあとだけ `scratch/tenant-backup-last.txt` を書く |
| `orgos tenant backup restore --archive <tar.gz> --into <空の絶対パス>` | 正本とは別の空ディレクトリへ展開する。正本と、空でないディレクトリは拒否する |

スナップショットから除くもの: `scratch/aia-runs`（作業中の下書き）と `node_modules`。退避先がテナントの中、または親ディレクトリが無い（未マウント）ときは書きません。

週次パイプラインは、退避先が未設定なら失敗にしません。設定済みでスタンプが無い、または 7 日より古いときだけ、経営バックアップと同じく週次を失敗にします。

## 履歴のリモート

`orgos tenant git-remote check` は `git_remote`（または `--url`）を分類します。製品リポジトリの origin は見ません。

- 許可: `file://` と ssh（`ssh://` または `git@host:path`）で、ホストが公開フォージではないもの
- 拒否: `github.com` · `gitlab.com` · `bitbucket.org`（scp 形式も含む）
- それ以外（https を含む）は受け付けません

未設定は終了コード 0 です。拒否は終了コード 1 で、リモートは変更しません。

## Drive

Drive へ出すファイル名は `AIA-` で始め、説明に「写し。正本ではない」を付けます。削除 API も、Drive から正本へ戻す取り込みもありません。
