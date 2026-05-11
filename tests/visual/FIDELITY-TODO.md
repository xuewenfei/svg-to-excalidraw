# Fidelity TODOs

Surface-area issues uncovered by `tests/visual/fidelity.playwright.ts`, which
rasterizes each W3C SVG fixture and diffs it against the same fixture converted
to Excalidraw and rendered via `@excalidraw/excalidraw`'s `exportToSvg`. Both
rasters share the source viewBox, aspect ratio, and inner canvas region — so
pixel diffs reflect real conversion quality, not layout drift.

When the converter is changed, re-run `bun run test:visual` and watch how the
diff percentages move. The current state-of-the-world is the baseline below;
tighten budgets in `fidelity.playwright.ts` as fixes land.

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
| `coords-trans-01-b` | 18.10% | 25% | **transformed-text mispositioning** |
| `painting-stroke-01-t` | 6.51% | 12% | clean |
| `text-intro-01-t` | 8.54% | 15% | clean |
| `paths-data-08-t` | 9.80% | 15% | clean |
| `pservers-grad-01-b` | 38.38% | 50% | **gradients render as no-fill** |

## TODOs

### 1. `TODO(fidelity:gradient-fallback)` — pick a solid color when fill is a gradient ref

**Site:** `src/converter/attributes.ts` (inside `fill` handler — see TODO comment).
**Symptom:** `pservers-grad-01-b` rasters as outlined rectangles with no fill,
because `<rect fill="url(#myGradient)">` ends up with `backgroundColor: "url(#myGradient)"`
which Excalidraw doesn't render.
**Fix sketch:** when `fill` matches `/^url\(#(.+)\)$/`, look up that id in the
source document. If it resolves to a `<linearGradient>`/`<radialGradient>`,
take the first `<stop stop-color>` (or perceptual average of all stops) and set
`backgroundColor` to that hex.
**Expected impact:** drops `pservers-grad-01-b` from ~38% → ~10%.
**Tighten:** after landing, lower the fixture's `fidelityFailRatio` to ~0.12.

### 2. `TODO(fidelity:transformed-text)` — apply rotation/scale from parent transforms to text

**Site:** `src/converter/walker.ts` inside the `text:` walker (see TODO comment).
**Symptom:** `coords-trans-01-b` shows transform-label text (`translate(...)`,
`rotate(...)`, `skewX(15)`, `skewY(15)`, `scale(2)`) at the right anchor point
but always horizontal and at the source font size — even when the parent `<g>`
has a non-identity rotation/scale. Only `result[12]` and `result[13]`
(translation) survive the matrix multiply; the rest is dropped.
**Fix sketch:** decompose `mat` into rotation + scale + translation. Set
`angle: rotationRadians` on the `ExcalidrawText`; multiply `fontSize` by the
uniform scale (or geometric mean of x/y scale). Skew can't be represented in
Excalidraw text and is best documented as a known limitation.
**Expected impact:** drops `coords-trans-01-b` from ~18% → ~8–10%.
**Tighten:** lower budget to ~0.15 after landing.

### 3. (investigate) polygon / polyline diff higher than other simple shapes

**Symptom:** `shapes-polygon-01-t` and `shapes-polyline-01-t` both diff ~12%
while comparable simple shapes (rect, circle, ellipse, line) all sit under 5%.
**Hypothesis:** Excalidraw renders polygon/polyline with different stroke join
or end-cap behavior than SVG default (`miter` vs `round`?). Worth opening one
of the diff overlays in `tests/visual/.diffs-fidelity/` and seeing whether the
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
