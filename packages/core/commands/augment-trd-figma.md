---
name: augment-trd-figma
description: >
  Augment an existing TRD with Figma design data. Extracts screenshots, component
  specifications, design tokens, and fixture data from Figma and adds a Visual Design
  Context section to the TRD. Pre-fetches all assets needed for subagent pixel-perfect work.
disable-model-invocation: true
---

# /augment-trd-figma

Enrich an existing TRD with Figma design data so that implementation agents have
everything they need for pixel-perfect visual fidelity — without needing Figma MCP access.

## Usage

```
/augment-trd-figma <figma-url> [--trd <path-to-trd>]
```

- `<figma-url>`: Figma URL to the container node (section/page) holding all design screens
- `--trd`: Path to existing TRD (defaults to `.trd-state/current.json` → current TRD)

## Why This Command Exists

**Subagents cannot access Figma MCP tools.** Only the main orchestrating session has MCP
access. This command runs in the main session to pre-fetch ALL Figma data and save it to
disk so that implementation agents (frontend-implementer, verify-app) can work from
committed files without needing Figma access.

Additionally, Figma REST API image exports have a rate limit (~30 req/min per account).
This command batches all downloads upfront to avoid hitting limits mid-implementation.

## Prerequisites

- Figma MCP server connected (`/mcp` shows `figma` listed)
- Figma personal access token available (for REST API image downloads)
- Existing TRD at the specified path
- `@playwright/test` installed in the project

## Workflow

### Step 1: Parse Figma URL and Discover Screens

Extract `fileKey` and `nodeId` from the Figma URL.

```
get_metadata(fileKey, containerNodeId)
```

Catalog all 1920×1080 frames (screens). For each, record:
- Node ID
- Name
- What state it represents
- Group state variations of the same page component

Present the inventory to the user:
```
Found 12 screens in "Knowledge Base & Playbook":
  1. KB - categories - all (3988:124034) [BROWSE]
  2. KB - subcategories (3988:121722) [BROWSE variant]
  3. Post - all open (3988:123596) [READER]
  ...
  12. Change History (3988:125741) [DEFERRED - not implemented]

Proceed with all 12? Or specify which to include:
```

### Step 2: Decompose Each Screen into Components

For each screen, use `get_metadata` to discover the component hierarchy:

```
get_metadata(fileKey, screenNodeId)
```

Build a component map:
```
Screen: KB - categories - all
  ├── SideMenu (shared, excluded)
  ├── Header (shared chrome)
  └── KB Content
      ├── CategorySidebar (410px)
      │   ├── SearchOverlay (atom)
      │   ├── StatusFilterPills (atom)
      │   └── CategoryTree (component)
      │       └── CategoryTreeNode (atom, repeated)
      ├── ContentArea (fluid)
      │   ├── BreadcrumbNav (atom)
      │   ├── SectionHeader (atom)
      │   └── PostCard (component, repeated)
      └── RightPanel (390px, conditional)
          ├── TableOfContents (component)
          └── PrimaryDetailsReadOnly (component)
```

Identify unique components across all screens. Note which components appear in
multiple screens (these are the highest priority for pixel-perfect work).

### Step 3: Extract Component Specifications

For each unique component, use `get_design_context` to extract exact visual properties:

```
get_design_context(fileKey, componentNodeId)
```

Extract and save:

| Property | Example |
|----------|---------|
| Dimensions | width: 1210px, height: 180px |
| Colors | background: #FFFFFF, text: #4E4E61, accent: #EA8213 |
| Typography | font: Roboto, size: 14px, weight: 400, lineHeight: 1.4 |
| Spacing | padding: 20px, gap: 8px, margin: 0 |
| Borders | radius: 4px, width: 1px, color: #ECEDF3 |
| Icons | SVG asset URLs from MCP |
| States | default, hover (#F2F3F8), selected (#FFF9F1 + #EA8213 text), disabled |

### Step 4: Download All Assets

**Baseline PNGs** (via Figma REST API at `scale=2`):

```bash
export FIGMA_TOKEN="<token>"
# Batch all screen node IDs in one request
curl -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/images/:fileKey?ids=ID1,ID2,...&format=png&scale=2"
```

Save to: `tests/visual/baselines/<screen-name>/<screen-name>.png`

**Component-level PNGs** (for atom/component-level comparison):

Download key sub-nodes as separate baselines for bottom-up iteration.

**Design context JSON**:

```bash
curl -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/files/:fileKey/nodes?ids=ID1,ID2,..."
```

Save to: `tests/visual/design-context/<group>.json`

**Embedded images** (screenshots, illustrations in article bodies):

Use `get_screenshot` via MCP for internal reference frames, download via REST API.
Save to: `src/assets/images/` or `public/assets/images/`

**Rate limit handling**: If REST API returns 429, use a secondary token or wait.
The `retry-after` header indicates wait time. MCP is unaffected by REST rate limits.

### Step 5: Extract Fixture Data

Use `get_design_context` to extract actual text content from Figma for test fixtures:

- Article titles, body text, excerpts
- Category/navigation tree names and structure
- Author names, dates, tag labels
- Breadcrumb paths
- Status badge text

Save to a fixture reference file: `tests/visual/design-context/fixtures.json`

This data will be used to populate:
- Dev harness fixtures (`src/pages/__dev/fixtures/`)
- MSW mock handlers (`src/mocks/handlers/`)
- Playwright test assertions

### Step 6: Augment the TRD

Add a new section to the TRD (after Section 6: Quality Requirements):

```markdown
## Section 7: Visual Design Context

### 7.1 Figma Reference
- **File**: [VFM v3.0](https://figma.com/design/:fileKey/...)
- **Container Node**: :containerNodeId
- **Token**: Available in project memory (see memory/reference_figma_token.md)

### 7.2 Screen Inventory

| # | Screen | Node ID | Type | State Variation Of |
|---|--------|---------|------|--------------------|
| 1 | KB categories | 3988:124034 | Browse | Base |
| 2 | KB subcategories | 3988:121722 | Browse | #1 (subcategory selected) |
| ... | | | | |

### 7.3 Component Specifications

#### PostCard
- **Node ID**: 3988:124065
- **Dimensions**: 1210 × 180px
- **Baseline**: tests/visual/baselines/post-card/post-card.png
- **Typography**: Title 16px/500, Excerpt 14px/400 #838390, Author 14px/400
- **Colors**: Background #FFFFFF, Tags #F8F9FD/#9D9DB2, Avatar #EA8213
- **Spacing**: Padding 20px, tag gap 6px, row gap 10px
- **States**: Default, with Draft badge, with context menu open

[Repeat for each component]

### 7.4 Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Primary accent | #EA8213 | Selected items, active pills, links |
| Primary text | #4E4E61 | Body text, labels |
| Help text | #838390 | Secondary text, dates |
| Background | #F8F9FD | Panel backgrounds |
| Borders | #ECEDF3 | Dividing lines |
| Selected bg | #FFF9F1 | Selected item background |
| Header dark | #3A3A46 | Section headers |

### 7.5 Baseline Assets

All Figma baselines committed at `tests/visual/baselines/` (2x scale).
Design context JSON at `tests/visual/design-context/`.
Embedded images at `src/assets/images/` or `public/assets/images/`.

### 7.6 Visual Quality Gates

| Target | Threshold | Max Diff Pixels | Notes |
|--------|-----------|-----------------|-------|
| Component level | 0.3 | 50K | Strict color matching |
| Screen level (text-heavy) | 0.75 | Per-screen budget | Anti-aliasing tolerance |
| Screen level (graphic-heavy) | 0.3 | Per-screen budget | Strict matching |
| Overall target | — | <5% of total pixels | ~415K for 3840×2160 |

### 7.7 Implementation Notes

- **Subagent constraint**: Subagents cannot access Figma MCP. All assets pre-fetched above.
- **DPR**: All baselines at 2x. Playwright must use `deviceScaleFactor: 2` + `scale: 'device'`.
- **Fixture data**: Exact text content extracted from Figma in `tests/visual/design-context/fixtures.json`.
- **Bottom-up order**: Iterate atoms → components → sections → screens.
- **Convergence targets**: 10% → 5% → 3% (stop when anti-aliasing is the remaining diff).
```

### Step 7: Generate Visual Task Definitions

Add visual implementation tasks to the TRD's Master Task List:

```markdown
### Visual Design Tasks

| Task ID | Description | Depends On | Skill Hints |
|---------|-------------|------------|-------------|
| VIS-F001 | Set up Playwright visual config (DPR=2, scale=device) | — | writing-playwright-tests |
| VIS-F002 | Create dev harness infrastructure | VIS-F001 | developing-with-react |
| VIS-F003 | Create component harnesses with Figma fixture data | VIS-F002 | figma-pixel-perfect |
| VIS-F004 | Iterate atoms to <5% pixel diff | VIS-F003 | figma-pixel-perfect |
| VIS-F005 | Iterate components to <5% pixel diff | VIS-F004 | figma-pixel-perfect |
| VIS-F006 | Iterate sections to <5% pixel diff | VIS-F005 | figma-pixel-perfect |
| VIS-F007 | Iterate screens to <5% pixel diff | VIS-F006 | figma-pixel-perfect |
| VIS-F008 | Wire MSW fixtures for real page verification | VIS-F007 | developing-with-react |
| VIS-F009 | Create integration tests against real app routes | VIS-F008 | writing-playwright-tests |
```

### Step 8: Commit and Report

Commit all downloaded assets and TRD augmentation:

```
chore: augment TRD with Figma visual design context

Download Figma baselines (Nx screens at 2x), extract component specs,
design tokens, and fixture data. Add Visual Design Context section to
TRD with component specifications, quality gates, and visual task
definitions.
```

Report to user:
- Number of screens cataloged
- Number of components identified
- Number of baseline PNGs downloaded
- Size of design context JSON
- Tasks added to TRD
- Any rate limit issues encountered

## Output

The command produces:
1. **Augmented TRD** with Visual Design Context section
2. **Baseline PNGs** in `tests/visual/baselines/`
3. **Design context JSON** in `tests/visual/design-context/`
4. **Embedded assets** in `src/assets/` or `public/assets/`
5. **Fixture reference** in `tests/visual/design-context/fixtures.json`
6. **Visual task definitions** added to TRD Master Task List
