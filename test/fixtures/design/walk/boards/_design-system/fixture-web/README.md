# Fixture Web

A small React + Tailwind component set: one action (`Button`), one container (`Card`), one label (`Chip`) and one switch row (`Toggle`), built from a single brand blue and a near-black ink. Everything here is read from the product's code (`components/index.jsx`, `tailwind.config.js`); nothing is invented.

## Content fundamentals

- Labels are short and imperative: "See trips", "Sign out". Sentence case, no trailing punctuation.
- A Card has one title and a short body. Titles are nouns ("Trips", "Settings").
- A Chip is a single word or place name ("Lisbon", "Osaka"), never a sentence.

## Visual foundations

- **Colour.** `brand` (#2f5bd2) is the only hue. It fills the primary Button and colours links and the secondary Button's text and border. `ink` (#1b1f2a) is all text. `white` is every surface; `slate-100` fills Chips and `slate-200` draws Card borders.
- **Contrast.** `white` on `brand` is about 5.9:1 and `ink` on `white` about 16:1, both above the 4.5:1 floor.
- **Shape.** Buttons use `radius-md`, Cards `radius-lg`, Chips `radius-full` (a pill). Nothing is sharp-cornered.
- **Depth.** One shadow, `shadow-sm`, on Cards only. Chips and Buttons are flat.
- **Spacing.** A 4px base: `space-1` to `space-4` (4, 8, 12, 16px). Cards pad `space-4`.
- **Touch targets.** Buttons and the Toggle row are at least 44px tall.
- **Type.** The system sans stack (`ui-sans-serif, system-ui, sans-serif`). The system ships no font files. Weights: 400 body, 500 Button label, 600 Card title.

## Iconography and logos

None. The product has no logo, icon or image assets, so none are included here and none are approximated.

## Components

| Component | Use it for |
|---|---|
| `Button` | The one action on a screen. `variant="primary"` (default) fills with `brand`; `variant="secondary"` is white with a `brand` border. |
| `Card` | Grouping a titled block of content. Takes `title` and children. |
| `Chip` | A short read-only label. |
| `Toggle` | One on/off setting as a full-width 44px row: `label`, `checked`, `onChange(next)`. Native `role="switch"` button; state shown by an On/Off word and thumb position. |

## Not synced

- Only one theme exists in the source, so there is no dark theme.
- Spacing, radius and shadow tokens are the Tailwind default values the components use; the product's `tailwind.config.js` defines only `brand` and `ink`.
- Stubs: none. All four exported components bundled.
