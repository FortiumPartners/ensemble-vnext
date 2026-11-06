# Boards from the live design walk

These are the boards, map and design system the live walk (DORCH-T001) produced against the
`react-web` fixture at commit 5a6d0e2, on 2026-11-05.

- `trips-refresh/design-map.json` and `trips-refresh/canvas/project/*.dc.html`: the eight boards
  (home and trips, each as-is and to-be) and the map that names them.
- `_design-system/fixture-web/`: the design system the boards were drawn with. It sits beside
  `trips-refresh/` so `design-render.js` finds it as `ds/fixture-web/`.

Source used: the walk's scratchpad, `walk/react-web/docs/ui/`. The scratchpad can be cleared by
the OS; the same files are in the rendered-boards artifact
(https://claude.ai/artifact/JwNxK9CWwYPxiAifTXkgxu).

The files are unmodified data, copied byte for byte. Do not edit them. `brief.md`, `grounding/`
and `_current/` were left behind on purpose.

They are force-added (`git add -f`) because `.gitignore` excludes `.trd-state/*/evidence/`. Once
tracked they stay tracked; the other scratch files in `evidence/` remain ignored.
