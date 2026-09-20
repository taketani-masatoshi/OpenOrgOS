# テナントの退避と履歴リモート

最新の正本はこのマシンのテナントディレクトリです。NAS は復元用のコピーで、作業ディレクトリにはしません。GitHub には実テナントを出しません。

退避は3系統です。混ぜません。

| 系統 | 何を残すか | 週次 |
|---|---|---|
| executive | 社長 YAML の日付確認（`scratch/executive-backup-last.txt`） | 社長データがあるときだけ失敗する |
| 台帳フリート | 製品台帳の別 tar（`scripts/backup-ledger-fleet.sh`） | この退避には合流しない |
| テナント tar | テナント一式の復元用。設定したときだけ週次が失敗する | 未設定なら何もしない |

連携ハブは置き場の説明だけです。退避の実行は `orgos tenant backup` で、画面にはボタンを置きません。

## 退避

`data/org/backup-target.yaml`（見本は `tenants/_template/data/org/backup-target.yaml.example`）:

```yaml
version: 1
destination: /Volumes/OrgNAS/orgos-restore/REPLACE_TENANT
volume_encrypted: true
```

`volume_encrypted: true` は、退避先のボリュームが既に暗号化されているという宣言です。アーカイブ自体の暗号や鍵管理は作りません。宣言が無い設定ではスナップショットしません。macOS でボリュームが非暗号化と読めたときだけ snapshot を拒否します。読めない NAS は宣言のまま通し、スタンプの `encryption` は `declared` です。暗号化されていると読めたときだけ `verified` です。

アーカイブの権限は `0600` です。こちらが新しく作った宛先ディレクトリだけ `0700` にします。既存ディレクトリの権限は変えません。同じ秒に二度退避しても、先のファイルは上書きしません。

| コマンド | 動き |
|---|---|
| `orgos tenant backup status` | 設定とスタンプの古さ。終了コードは 0。未達は警告で、成功したことにはしない |
| `orgos tenant backup snapshot` | 一時ファイルへ tar し、成功したあと `0600` で確定する。失敗したら一時ファイルもスタンプも残さない |
| `orgos tenant backup restore --archive <tar.gz> --into <空の絶対パス>` | メンバーに絶対パスや `..` があれば展開しない。隣の一時ディレクトリで展開し、成功したときだけ指定先と入れ替える |

スナップショットから除くもの: `scratch/aia-runs` と `data/scratch/aia-runs`（作業中の下書き）と `node_modules`。`.git` は復元用に残します。退避先がテナントの中、または親ディレクトリが無い（未マウント）ときは書きません。

本番（認証バイパスが無いとき）の snapshot と restore は `ceo` / `approver` だけが実行できます。status と `git-remote check` は読み取りのままです。

スタンプ `scratch/tenant-backup-last.txt` には日付、アーカイブの絶対パス、バイト数、sha256、`encryption` を書きます。週次は、アーカイブが存在し、大きさとハッシュが一致し、7 日以内のときだけ成功です。日付だけのファイルは成功にしません。このスタンプファイルだけを gitignore します。

週次パイプラインは、退避先が未設定なら失敗にしません。設定済みでスタンプが無い、実体と一致しない、または 7 日より古いとき、週次を失敗にします。その作業指示は `orgos tenant backup snapshot` です（公開リモートなら `orgos tenant git-remote check`）。イベント連鎖の再署名は書きません。`orgos validate` は同じ条件のとき warning だけで、終了コードは失敗にしません。未設定なら warning も出しません。

## 履歴のリモート

`orgos tenant git-remote check` は `git_remote`（または `--url`）を分類します。製品リポジトリの origin は見ません。テナント直下に `.git` があるときは、その remote も同じ規則で見ます。一つでも公開フォージなら snapshot を拒否し、週次も失敗します。

- 許可: `file://`、ssh（`ssh://` または `git@host:path`）、公開フォージ以外の `https` / `http`
- 拒否: `github.com` · `gitlab.com` · `bitbucket.org` と、そのサブドメイン（`ssh.github.com` など）。末尾のドットは外してから判定する。scheme は問わない
- 届く `file://` が git リポジトリなら、その remote を同じ規則で見る。一つでも公開フォージなら拒否する
- パスが無くて読めない `file://` は「未検査」。成功扱いにはしないが、週次は失敗にしない

未設定は終了コード 0 です。拒否は終了コード 1 で、リモートは変更しません。`git_remote` が設定済みで公開フォージのときだけ、週次も失敗します。

## Drive

Drive へ出すファイル名は `AIA-` で始め、説明に「写し。正本ではない」を付けます。削除 API も、Drive から正本へ戻す取り込みもありません。
