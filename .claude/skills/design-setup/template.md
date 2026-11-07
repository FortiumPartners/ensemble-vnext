# Design

**Owner-governed, like `verification.md`. It changes only when the owner runs
`/design-setup`, which asks, then writes; running it is the approval. No autonomous run
edits this file.** The file is committed: it holds no credential, only where one lives.

The design commands (`/create-design`, `/refine-design`, `/audit-design`, `/design-system`,
`/sync-design`) read this file to know how this product is designed and how to reach a
screen. A file identical to this template is unfilled and the commands stop. A field of §5
(design direction) left blank does not stop them: they draw with the product's own design
system and no style pack, and name each blank field and point at `/design-setup`.

## 1. Design system

| Field | Value |
|-------|-------|
| Design system artifact link and namespace | |
| Source of truth (`code`, `figma` or `canvas`) | |
| Build command for the design system | |
| May the product's build run to bundle components? (`yes` / `no`) | |

## 2. Per platform

One row per platform the product ships (for example `web`, `ios`).

| Platform | Board component kind (`real` or `parts`) | Tokens source | Component library paths | Viewport sizes |
|----------|-------------------------------------------|---------------|-------------------------|----------------|
| | | | | |

## 3. How to reach a screen

| Field | Value |
|-------|-------|
| Route list (file, command or URL list) | |
| Sign-in | see `verification.md` §3 (`Test identities and credentials`); no credential is written here |
| Seed data (environment in `verification.md` §1 and how it is seeded) | |
| Capture command | |
| Where current screenshots live | |

## 4. Design rules

- **Reuse:** the design system's components and tokens; a new component needs a reason. How far a layout departs from today's screen is §5's departure latitude.
- **Accessibility floor:** (the owner's answer, recorded by `/design-setup`)
- **Process rules:** (for example "every round publishes a before/after")

## 5. Design direction

| Field | Value |
|-------|-------|
| Brand (voice, personality, colours the design must keep) | |
| Style pack (a `style-pack-*` skill name) | |
| References (every product or site to draw toward) | |
| Departure latitude (`keep`, `refine` or `rethink`) | |

Departure latitude says how far a to-be board may move from today's screen. Components and
tokens are reused at every level.

- **`keep`**: keep the current screen's layout and structure; change only what the brief items require.
- **`refine`**: keep the information architecture and navigation; layout, spacing, hierarchy and visual treatment may change.
- **`rethink`**: layout, navigation placement and composition may change entirely.
