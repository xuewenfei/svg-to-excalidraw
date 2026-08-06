# Fidelity TODOs

Surface-area issues uncovered by `tests/visual/fidelity.spec.ts`, which
rasterizes each W3C SVG fixture and diffs it against the same fixture converted
to Excalidraw and rendered via `@excalidraw/excalidraw`'s `exportToSvg`. Both
rasters share the source viewBox, aspect ratio, and inner canvas region — so
pixel diffs reflect real conversion quality, not layout drift.

When the converter is changed, re-run `bun run test:visual` and watch how the
diff percentages move. The current state-of-the-world is the baseline below;
tighten budgets in `fidelity.spec.ts` as fixes land.

## Current diff baseline (2026-05-11)

| Fixture | Diff | Budget | Notes |
|---|---|---|---|
| `shapes-rect-01-t` | 5.76% | 10% | clean — anti-aliasing only |
| `shapes-circle-01-t` | 3.85% | 8% | clean |
| `shapes-ellipse-01-t` | 4.51% | 8% | clean |
| `shapes-line-01-t` | 4.62% | 8% | clean |
| `shapes-polygon-01-t` | 11.83% | 18% | stroke joins/ends differ from SVG |
| `shapes-polyline-01-t` | 11.59% | 18% | same as polygon |
| `paths-data-01-t` | 9.38% | 15% | clean |
| `struct-group-01-t` | 2.15% | 8% | clean |
| `coords-trans-01-b` | 18.10% | 25% | residual diff is L-shape/grid placement; text labels in this fixture don't sit inside rotated groups, so the text-transform fix didn't move the number |
| `painting-stroke-01-t` | 6.51% | 12% | clean |
| `text-intro-01-t` | 8.54% | 15% | clean |
| `paths-data-08-t` | 9.68% | 15% | clean |
| `pservers-grad-01-b` | 38.38% | 50% | both rects now filled with averaged stop color; per-pixel metric doesn't reward flat-vs-gradient swap (still differs at threshold 0.1 everywhere inside the bar) |

## Completed

- **gradient fallback** (`src/converter/attributes.ts` fill handler): `url(#id)`
  fills resolve to the perceptual Lab average of the referenced
  `<linearGradient>` / `<radialGradient>` stops. Follows `href` / `xlink:href`
  chains (capped depth) so gradients that inherit stops from another gradient
  still resolve. Numeric diff for `pservers-grad-01-b` is unchanged because both
  flat gray and gradient pixels exceed `threshold: 0.1` against each other, but
  the raster now shows both bars filled with a representative color instead of
  empty outlines.
- **transformed text** (`src/converter/walker.ts` text walker): decomposes the
  parent transform matrix into rotation + uniform scale, sets `angle` and a
  scaled `fontSize` on the `ExcalidrawText`, and places `x/y` so the rotated
  box's center lands at the SVG anchor's transformed center (Excalidraw rotates
  about element center, not top-left). Skew and shear are intentionally dropped
  (Excalidraw text has no skew). Plain non-transformed text positioning is
  unchanged because under identity rotation/scale the center-based placement
  reduces to the previous top-left placement.

## Open

### (investigate) polygon / polyline diff higher than other simple shapes

**Symptom:** `shapes-polygon-01-t` and `shapes-polyline-01-t` both diff ~12%
while comparable simple shapes (rect, circle, ellipse, line) all sit under 5%.
**Hypothesis:** Excalidraw renders polygon/polyline with different stroke join
or end-cap behavior than SVG default (`miter` vs `round`?). Worth opening one
of the diff overlays in `tests/visual/.working/diffs/` and seeing whether the
diff concentrates on joins/ends or on the body of the strokes.
**No TODO comment in code yet** — file one once a root cause is identified.

## Test plumbing notes

- The fidelity test loads source SVG via `<img src="data:image/svg+xml;base64,...">`
  rather than inlining it into the HTML doc. Inlining made the browser render
  the foreign-namespaced W3C test-case metadata (`<d:testDescription>`, `<p>`,
  etc.) as HTML text, which dominated the pixel diff. `<img>` forces strict
  XML parsing of the SVG so only the graphics render.
- Excalidraw's `exportToSvg` computes its own viewBox from the bbox of rendered
  elements. We overwrite that viewBox to match the source SVG's viewBox so both
  rasters share a coordinate window. Without this, the two rasters drift in
  scale because Excalidraw's bbox excludes empty space the source viewBox
  includes.
- The inner canvas region is 720×540 (4:3) — matching the W3C fixtures'
  viewBox aspect — so the SVG fills the inner box edge-to-edge with no
  letterboxing. If a fixture with a different aspect is added, either the
  container should adapt or `preserveAspectRatio="xMidYMid meet"` (default)
  will letterbox both rasters symmetrically.
- `struct-use-01-t.svg` is excluded because the converter throws on it
  (`Unable to create ex element` at `src/converter/walker.ts:238`). That's a
  separate bug worth its own ticket.
