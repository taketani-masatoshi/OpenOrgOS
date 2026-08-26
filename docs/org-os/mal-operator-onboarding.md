# 株式会社 MAL — オペレーター onboarding（L1）

**対象:** テナント `mal` · Operator Console · Community SSO

---

## 現状（2026）

| 席 | operator | メール | 備考 |
|----|----------|--------|------|
| CEO | OP-001 | 創業者 Gmail（grandfather） | Community SSO 本鍵 |
| 秘書 AIA | OP-002 | なし | 人間 SSO 対象外 |

`login_policy.email_domains`: `malkk.com`  
`grandfather_emails`: 創業者1席（CEO と一致）

---

## 入口（Web UI）

| 画面 | URL / 経路 |
|------|------------|
| **オペレーター管理（招待）** | Operator Console `/?account=1`（予実 → アカウント） |
| Community から | My Page → **オペレーター管理** → Console handoff |
| API | `POST /chat/v1/product/admin/operators`（CEO / approver のみ） |

---

## 三塚さん（常勤 @malkk.com）を追加する順序

### 1. 創業者の会社メール移行（retire 前）

1. OP-001 の `email` を `ceo@malkk.com` 等に更新（`operators.yaml`）
2. Community でも同じ Google / メールでログインできることを確認
3. CLI（人間のみ）:

```bash
orgos operator founder-email retire
```

### 2. Console で招待

1. `http://127.0.0.1:9470/?account=1`（または My Page 経由）
2. 表示名・`mitsuka@malkk.com`・ロール「経理担当」または「承認者」
3. UI の login_policy セクションでブロックされていないことを確認

### 3. 三塚さん側（Community）

1. 同じメールで Community に Google ログイン
2. **OOO 認定**を申請 → 管理者承認
3. My Page → Operator Console → `/settings/` で PassKey 初回登録

---

## 鍵の位置づけ

| 鍵 | 用途 |
|----|------|
| **本鍵** | 会社ドメイン Community SSO |
| **第2鍵** | ログイン PassKey（Mac + 予備 iPhone、**最大2本/operator**） |
| **Settlement PassKey** | 承認専用（ログイン復旧に使わない） |

故障時: SSO 本鍵で再ログイン → 壊れた login PassKey を削除 → 再登録。

---

## Community 環境変数（先拒否）

`.env` で Steward `login_policy` と揃える:

```bash
OOO_LOGIN_EMAIL_DOMAINS=malkk.com
OOO_LOGIN_EMAIL_GRANDFATHER=k.lab.masa@gmail.com
```

---

## 関連

- [operator-policy.md §4.2](../../steward/rules/operator-policy.md)
- [passkey-troubleshooting.md](./passkey-troubleshooting.md)
- [operator-production.md](../operator-production.md)
