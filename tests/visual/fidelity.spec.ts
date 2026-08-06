import { mkdirSync, rmSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { compare } from 'odiff-bin'

process.env.SVG_TO_EXCALIDRAW_SEED = '1'
const { convert } = await import('../../src/converter')

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, '..', 'fixtures', 'w3c')
// The fixture SVG is the single source of truth. SVG rasters and Excalidraw
// rasters are rendered on the fly into a per-test tmp dir (odiff needs file
// paths) and deleted after diffing. Only the diff overlay persists, under
// .working/diffs/, so you can open it when a check fails.
// Set KEEP_RASTERS=1 to also persist the SVG + Excalidraw rasters under
// .working/svg-rasters/ and .working/excalidraw-rasters/ for deeper debugging.
// The .working/ tree is wiped at the start of each run so no stale files survive.
const WORKING = path.join(HERE, '.working')
const DIFFS = path.join(WORKING, 'diffs')
const KEEP_RASTERS = !!process.env.KEEP_RASTERS
const SVG_RASTERS = path.join(WORKING, 'svg-rasters')
const EXCAL_RASTERS = path.join(WORKING, 'excalidraw-rasters')

rmSync(WORKING, { recursive: true, force: true })
const dirs = KEEP_RASTERS ? [DIFFS, SVG_RASTERS, EXCAL_RASTERS] : [DIFFS]
for (const dir of dirs) mkdirSync(dir, { recursive: true })

const THRESHOLD = 0.1 // generous per-pixel tolerance — sketchy strokes ok
// Canvas is sized so the inner box (after padding) is exactly 4:3, matching the
// W3C fixture viewBox aspect. That way the SVG fills the inner box edge-to-edge
// with no letterboxing, and both rasters share the same coordinate mapping.
const CANVAS_W = 800
const CANVAS_H = 600
const PAD_X = 40
const PAD_Y = 30 // 720 / 540 = 4/3

/**
 * Parse the source SVG's declared viewBox. Fallback to "0 0 width height" or "0 0 480 360".
 * This is the canonical coordinate space we anchor both rasters to.
 */
function extractViewBox(svg: string): string {
	const vb = /viewBox\s*=\s*"([^"]+)"/i.exec(svg)
	if (vb?.[1]) return vb[1].trim()
	const w = /\bwidth\s*=\s*"([\d.]+)"/i.exec(svg)?.[1] ?? '480'
	const h = /\bheight\s*=\s*"([\d.]+)"/i.exec(svg)?.[1] ?? '360'
	return `0 0 ${w} ${h}`
}

type Task = {
	file: string
	label: string
	// max fraction of pixels allowed to differ between source raster and excalidraw raster
	fidelityFailRatio: number
}

const TASKS: readonly Task[] = [
	{
		file: 'shapes-rect-01-t.svg',
		label: 'rect basics',
		fidelityFailRatio: 0.1,
	},
	{
		file: 'shapes-circle-01-t.svg',
		label: 'circle basics',
		fidelityFailRatio: 0.08,
	},
	{
		file: 'shapes-ellipse-01-t.svg',
		label: 'ellipse basics',
		fidelityFailRatio: 0.08,
	},
	{
		file: 'shapes-line-01-t.svg',
		label: 'line basics',
		fidelityFailRatio: 0.08,
	},
	{
		file: 'shapes-polygon-01-t.svg',
		label: 'polygon',
		fidelityFailRatio: 0.18,
	},
	{
		file: 'shapes-polyline-01-t.svg',
		label: 'polyline',
		fidelityFailRatio: 0.18,
	},
	{
		file: 'paths-data-01-t.svg',
		label: 'paths: M/L/Z',
		fidelityFailRatio: 0.15,
	},
	{
		file: 'struct-group-01-t.svg',
		label: 'group nesting',
		fidelityFailRatio: 0.08,
	},
	{
		file: 'coords-trans-01-b.svg',
		label: 'transforms',
		fidelityFailRatio: 0.25,
	},
	{
		file: 'painting-stroke-01-t.svg',
		label: 'stroke variations',
		fidelityFailRatio: 0.12,
	},
	{ file: 'text-intro-01-t.svg', label: 'text intro', fidelityFailRatio: 0.15 },
	{
		file: 'paths-data-08-t.svg',
		label: 'paths: arcs',
		fidelityFailRatio: 0.15,
	},
	// Gradients are unsupported by the converter (flat fill substitute), so this diffs heavily.
	{
		file: 'pservers-grad-01-b.svg',
		label: 'linear gradients (unsupported)',
		fidelityFailRatio: 0.5,
	},
] as const

// Load the source SVG via <img src="data:image/svg+xml;base64,..."> so the browser
// parses it as standalone XML. Inlining into the HTML doc causes foreign-namespaced
// W3C test-case metadata (d:testDescription, <p>, etc.) to render as HTML text,
// which would dominate the pixel diff. <img> isolates rendering to just the graphics.
const SOURCE_HTML = (svg: string) => {
	const encoded = Buffer.from(svg, 'utf8').toString('base64')
	return `<!doctype html><html><head><meta charset="utf-8"/><style>
html,body{margin:0;padding:0;background:#fff;}
#render{width:${CANVAS_W}px;height:${CANVAS_H}px;background:#fff;box-sizing:border-box;padding:${PAD_Y}px ${PAD_X}px;}
#render img{width:100%;height:100%;object-fit:contain;object-position:center;}
</style></head><body>
<div id="render"><img id="src" src="data:image/svg+xml;base64,${encoded}"/></div>
</body></html>`
}

const EXCAL_HTML = `<!doctype html><html><head><meta charset="utf-8"/><style>
html,body{margin:0;padding:0;background:#fff;}
#render{width:${CANVAS_W}px;height:${CANVAS_H}px;background:#fff;box-sizing:border-box;padding:${PAD_Y}px ${PAD_X}px;}
#render svg{width:100%;height:100%;display:block;}
</style></head><body>
<div id="render"></div>
<script type="module">
import { exportToSvg } from 'https://esm.sh/@excalidraw/excalidraw@0.18.0?bundle';
window.renderExcalidraw = async (elements, viewBox) => {
  const c = document.getElementById('render');
  c.replaceChildren();
  if (!elements || elements.length === 0) { c.textContent = '(no elements)'; return false; }
  const svg = await exportToSvg({
    elements,
    appState: { exportBackground: false, exportWithDarkMode: false, viewBackgroundColor: '#ffffff' },
    files: null,
    exportPadding: 0,
  });
  // Anchor to the source SVG's viewBox so both rasters use the same coordinate window.
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.width = '100%';
  svg.style.height = '100%';
  c.appendChild(svg);
  return true;
};
window.__ready = true;
</script></body></html>`

for (const task of TASKS) {
	test(`fidelity: ${task.label}`, async ({ page }) => {
		const svg = await readFile(path.join(FIXTURES, task.file), 'utf8')
		const slug = task.file.replace(/\.svg$/, '')
		const viewBox = extractViewBox(svg)

		// 1. Rasterize source SVG via Playwright. Written to an ephemeral tmp
		// dir — the fixture .svg is the source of truth; we re-render on the fly
		// and only persist long enough for odiff (which takes file paths).
		await page.setContent(SOURCE_HTML(svg), { waitUntil: 'load' })
		await page.waitForFunction(() => {
			const img = document.getElementById('src') as HTMLImageElement | null
			return !!img && img.complete && img.naturalWidth > 0
		})
		const sourcePng = await page.locator('#render').screenshot()
		const tmpDir = KEEP_RASTERS
			? null
			: await mkdtemp(path.join(os.tmpdir(), 'svg-fidelity-'))
		const sourcePath = KEEP_RASTERS
			? path.join(SVG_RASTERS, `${slug}.png`)
			: path.join(tmpDir as string, `${slug}-svg.png`)
		const actualPath = KEEP_RASTERS
			? path.join(EXCAL_RASTERS, `${slug}.png`)
			: path.join(tmpDir as string, `${slug}-excalidraw.png`)
		await writeFile(sourcePath, sourcePng)

		// 2. Run converter and render via Excalidraw.
		const result = convert(svg)
		expect(result.hasErrors, 'converter should not error').toBe(false)
		const elements = result.content?.elements ?? []
		expect(
			elements.length,
			'converter should produce at least one element',
		).toBeGreaterThan(0)

		await page.setContent(EXCAL_HTML, { waitUntil: 'load' })
		await page.waitForFunction(
			() => (window as unknown as { __ready: boolean }).__ready === true,
			null,
			{ timeout: 30_000 },
		)
		const ok = await page.evaluate(
			async (args) =>
				await (
					window as unknown as {
						renderExcalidraw: (e: unknown, vb: string) => Promise<boolean>
					}
				).renderExcalidraw(args.elements, args.viewBox),
			{ elements: elements as unknown, viewBox },
		)
		expect(ok, 'excalidraw rendered something').toBe(true)
		const excalPng = await page.locator('#render').screenshot()
		await writeFile(actualPath, excalPng)

		// 3. Diff. The diff overlay is the only artifact worth keeping — it's
		// what you open to see *where* the converter drifted from the SVG.
		const diffPath = path.join(DIFFS, `${slug}.png`)
		const cmp = await compare(sourcePath, actualPath, diffPath, {
			threshold: THRESHOLD,
			failOnLayoutDiff: false,
			outputDiffMask: false,
		})
		if (tmpDir) await rm(tmpDir, { recursive: true, force: true })

		const diffRatio =
			cmp.match === false && 'diffPercentage' in cmp
				? (cmp.diffPercentage as number) / 100
				: 0
		console.log(
			`[fidelity] ${slug}: diff=${(diffRatio * 100).toFixed(2)}% budget=${(task.fidelityFailRatio * 100).toFixed(0)}%`,
		)
		expect(
			diffRatio,
			`pixel diff exceeded ${(task.fidelityFailRatio * 100).toFixed(1)}%; see ${diffPath}`,
		).toBeLessThanOrEqual(task.fidelityFailRatio)
	})
}
