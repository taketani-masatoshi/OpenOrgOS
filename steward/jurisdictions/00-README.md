# steward/jurisdictions — 法域パック索引

組織 OS の **Jurisdiction Pack** 索引。実体は `steward/jurisdiction-packs/{code}/`（将来は独立 GitHub リポジトリ）。

**製品ゴール（分母）:** [docs/org-os/tjs-11-target-jurisdictions.md](../../docs/org-os/tjs-11-target-jurisdictions.md) — 249 法域 stub 索引 ≠ 完成度分母。

| 索引 | 役割 |
|------|------|
| [registry.yaml](registry.yaml) | インストール先 `pack_root` |
| [packs.lock.yaml](packs.lock.yaml) | version pin · `source`（bundled / github:…） |

| パック | リポジトリ（目標） | テナント例 |
|--------|-------------------|-----------|
| JP | steward-os/jurisdiction-jp | `mal` |
| US | steward-os/jurisdiction-us | `us-demo` |
| SG | steward-os/jurisdiction-sg | `sg-demo` |
| EE | steward-os/jurisdiction-ee | `ee-demo` |
| HK | steward-os/jurisdiction-hk | `hk-demo` |
| AU | steward-os/jurisdiction-au | `au-demo` |
| TW | steward-os/jurisdiction-tw | `tw-demo` |
| MY | steward-os/jurisdiction-my | `my-demo` |
| CN | steward-os/jurisdiction-cn | `cn-demo` |
| AE | steward-os/jurisdiction-ae | `ae-demo` |
| RU | steward-os/jurisdiction-ru | `ru-demo` |
| EU | steward-os/jurisdiction-eu | `eu-demo`（TJS メタ · subdivisions DE FR GB） |

```bash
npm run orgos -- jurisdiction list
npm run orgos -- jurisdiction packs list
npm run orgos -- jurisdiction packs check
```

契約: [../jurisdiction-packs/pack_contract.md](../jurisdiction-packs/pack_contract.md) · [../../docs/org-os/jurisdiction-oss-governance.md](../../docs/org-os/jurisdiction-oss-governance.md) · [../../docs/org-os/tjs-11-target-jurisdictions.md](../../docs/org-os/tjs-11-target-jurisdictions.md)
