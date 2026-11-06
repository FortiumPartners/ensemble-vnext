# Design

**Owner-governed, like `verification.md`. It changes only when the owner runs
`/design-setup`, which asks, then writes; running it is the approval. No autonomous run
edits this file.** The file is committed: it holds no credential, only where one lives.

The design commands (`/create-design`, `/refine-design`, `/audit-design`, `/design-system`,
`/sync-design`) read this file to know how this product is designed and how to reach a
screen. A field left blank is unfilled; the commands stop and name it rather than guess.

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

- **Reuse:** an existing view beats a new one; a new component needs a reason.
- **Accessibility floor:** (the owner's answer, recorded by `/design-setup`)
- **Competitor references:**
- **Process rules:** (for example "every round publishes a before/after")
