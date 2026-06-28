# travel_booking — モジュール CLI

| ファイル | 役割 |
|---------|------|
| `lib.ts` | 旅費手配ロジック（intake · REG-008 · draft MD） |
| `commands.ts` | `operations travel` サブコマンド handler |
| `register.ts` | `ModuleCliBundle` — `src/lib/module-cli.ts` へ登録 |

```bash
npm run orgos -- operations travel portals
npm run orgos -- operations travel intake --destination 大阪 --area 新大阪 ...
npm run orgos -- operations travel draft --write ...
```

後方互換: `src/lib/travel-booking.ts` · `src/commands/travel.ts` は re-export。
