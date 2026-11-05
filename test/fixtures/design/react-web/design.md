# Design

Filled example for the React web fixture. Credentials are never written here; sign-in points at `verification.md` section 3.

## Design system

- Artifact link and namespace: none yet (`/design-system` records it); namespace `fixture-web`
- Source of truth: code
- Build command: `npx esbuild components/index.jsx --bundle --format=iife --global-name=FixtureWeb`
- Product build may run to bundle components: yes

## Platforms

### web

- Board component kind: real
- Tokens source: `tailwind.config.js`
- Component library paths: `components/`
- Viewport sizes: 390x844, 1280x800

## How to reach a screen

- Routes: `/`, `/trips`, `/settings`
- Sign-in and seed data: none needed; if added, see `verification.md` section 3 (local environment)
- Capture command: `npm run web`, then screenshot `http://localhost:3110<route>`
- Current screenshots live in: `docs/ui/_current/`

## Design rules

- Reuse: an existing view beats a new one; a new component needs a reason.
- Accessibility floor: contrast 4.5:1, touch targets 44 px (the owner's answer, accepted as offered).
- Competitor references: none.
- Process: every round publishes a before/after.
