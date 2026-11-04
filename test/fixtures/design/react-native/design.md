# Design

Filled example for the React Native fixture. Credentials are never written here; sign-in points at `verification.md` section 3.

## Design system

- Artifact link and namespace: none yet (`/design-system` records it); namespace `fixture-native`
- Source of truth: code
- Build command: `npx esbuild src/components.jsx --bundle --format=iife --global-name=FixtureNative --jsx=automatic --jsx-import-source=nativewind --alias:react-native=react-native-web`
- Product build may run to bundle components: yes

## Platforms

### mobile

- Board component kind: real (React Native components drawn through react-native-web)
- Tokens source: `tailwind.config.js` (NativeWind 4 preset, Tailwind 3.x)
- Component library paths: `src/components.jsx`
- Viewport sizes: 390x844

## How to reach a screen

- Routes: `/`, `/detail`
- Sign-in and seed data: none needed; if added, see `verification.md` section 3 (local environment)
- Capture command: `npm run web`, then screenshot `http://localhost:3200<route>` at 390x844
- Current screenshots live in: `docs/ui/_current/`

## Design rules

- Reuse: an existing view beats a new one; a new component needs a reason.
- Accessibility floor: contrast 4.5:1, touch targets 44 px (the owner's answer, accepted as offered).
- Competitor references: none.
- Process: every round publishes a before/after.
