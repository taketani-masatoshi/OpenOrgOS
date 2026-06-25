# Executive バックアップ — 初回 10 分チェックリスト

**対象:** 段 · Secretary · 新 Mac / 新 clone 直後  
**正本:** [backup-procedure.md](backup-procedure.md)

---

## 0. 前提（2 分）

- [ ] `data/executive/` で `cp *.yaml.example *.yaml` 済み
- [ ] `npm run validate` — executive YAML 警告なし（または意図どおり未作成）
- [ ] 暗号化 USB/SSD を用意（FileVault またはボリューム暗号化）

## 1. 初回 stamp（1 分）

```bash
mkdir -p scratch
echo $(date +%Y-%m-%d) > scratch/executive-backup-last.txt
npm run validate   # stamp 警告が消えることを確認
```

## 2. SSD 手動コピー（5 分）

```bash
# SSD を /Volumes/BACKUP にマウントした例
cp -a tenants/mal/data/executive tenants/mal/docs/executive \
  "/Volumes/BACKUP/steward-executive-$(date +%Y%m%d)/"
```

- [ ] `calendar.yaml` · `tasks.yaml` がコピー先にある
- [ ] SSD を eject · 保管場所を段と合意

## 3. ISO 1 行（1 分）

`docs/compliance/iso/ISO-27001/operations-log.md` に追記:

```markdown
| YYYY-MM-DD | executive バックアップ | 初回 SSD コピー · stamp 作成 | Secretary |
```

## 4. 週次ゲート確認（1 分）

```bash
npm run steward -- pipeline run weekly --skip-validate
# stamp 7 日超で exit 1 — 月曜 SSD 後に stamp 更新が必要
```

---

**毎週月曜:** [backup-procedure.md](backup-procedure.md) §Secretary 週次確認 · [secretary_behavior.md](../../rules/secretary_behavior.md) §月曜報告

**四半期:** リストア dry-run 1 回 — [backup-procedure.md](backup-procedure.md) §四半期リストア演習
