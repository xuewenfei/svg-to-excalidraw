import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { compare } from 'odiff-bin'

process.env.SVG_TO_EXCALIDRAW_SEED = '1'
const { convert } = await import('../../src/converter')

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, '..', 'fixtures', 'w3c')
const SOURCE = path.join(HERE, '.source-fidelity')
const ACTUAL = path.join(HERE, '.actual-fidelity')
const DIFFS = path.join(HERE, '.diffs-fidelity')

for (const dir of [SOURCE, ACTUAL, DIFFS]) {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

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

		// 1. Rasterize source SVG via Playwright.
		await page.setContent(SOURCE_HTML(svg), { waitUntil: 'load' })
		await page.waitForFunction(() => {
			const img = document.getElementById('src') as HTMLImageElement | null
			return !!img && img.complete && img.naturalWidth > 0
		})
		const sourcePng = await page.locator('#render').screenshot()
		const sourcePath = path.join(SOURCE, `${slug}.png`)
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
		const actualPath = path.join(ACTUAL, `${slug}.png`)
		await writeFile(actualPath, excalPng)

		// 3. Diff.
		const diffPath = path.join(DIFFS, `${slug}.png`)
		const cmp = await compare(sourcePath, actualPath, diffPath, {
			threshold: THRESHOLD,
			failOnLayoutDiff: false,
			outputDiffMask: false,
		})

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
