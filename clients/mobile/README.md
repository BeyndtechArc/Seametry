# clients/mobile

The Seametry app for iOS and Android, built with Expo 57 and expo-router.
The first screen is the Allocation (Choose, then Buy), the same flow as the
web app's `/app/allocation`. Requirements live in `docs/prd/MOBILE.md`; every
design decision lives in `.claude/skills/seametry-design/`.

## What it owns, and what it borrows

The app computes nothing the server decides. It reads the lots, stamps, fee
schedule and availability from `GET /api/allocation/offer` on the web app,
and prepares, submits and watches each purchase through the same
`/api/allocation/*` routes the web page uses. It holds no key and no secret.

Two files are read from elsewhere so each keeps one owner: the generated
design tokens (`clients/packages/ui/src/generated/tokens.ts`) and the web
app's exact amount arithmetic (`clients/web/src/lib/amount.ts`). `metro.config.js`
watches both and `tsconfig.json` names them `@shared/tokens` and `@shared/amount`.

This package is its own npm project, outside the root workspace: Expo 57
pins React 19.2.3 and the web app runs 19.3.0, and sharing one workspace
would let the app resolve the web app's React. Install here, not at the root.

## Run it

```bash
npm install
npx expo start --web          # browser preview: renders the screens, cannot sign
```

Point a build at a local web app with `EXPO_PUBLIC_SEAMETRY_ORIGIN=http://localhost:3000`.

Signing needs two things only Storm can provide:

1. A **Phantom Connect App ID** from Phantom Portal, set as
   `EXPO_PUBLIC_PHANTOM_APP_ID`. Without it the app builds and inspects a
   plan and says signing is unavailable.
2. A **development build**, because Phantom's SDK carries native code that
   Expo Go cannot load: `npx eas-cli@latest build --profile development`
   with an Expo account; iOS also needs an Apple Developer account
   (installed through TestFlight or a registered device).

## Working on it

- Add packages with `npx expo install <package>`, which picks versions
  matched to the SDK; plain `npm install` can pick ones that do not run.
- Routes live in `src/app/`; everything else under `src/` is not a route.
- `ios/` and `android/` are generated from `app.json` and never edited by
  hand.
- Before calling a change done: `npx tsc --noEmit` and `npx expo-doctor`.
- Expo changes between SDKs: check the API against
  `https://docs.expo.dev/versions/v57.0.0/` rather than memory.
