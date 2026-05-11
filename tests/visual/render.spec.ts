import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { toHaveScreenshotOdiff } from 'playwright-odiff'

expect.extend({ toHaveScreenshotOdiff })

process.env.SVG_TO_EXCALIDRAW_SEED = '1'
const { convert } = await import('../../src/converter')

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, '..', 'fixtures', 'w3c')

const TASKS = [
	{ file: 'shapes-rect-01-t.svg', label: 'rect basics' },
	{ file: 'shapes-circle-01-t.svg', label: 'circle basics' },
	{ file: 'shapes-ellipse-01-t.svg', label: 'ellipse basics' },
	{ file: 'shapes-line-01-t.svg', label: 'line basics' },
	{ file: 'shapes-polygon-01-t.svg', label: 'polygon' },
	{ file: 'shapes-polyline-01-t.svg', label: 'polyline' },
	{ file: 'paths-data-01-t.svg', label: 'paths: M/L/Z' },
	{ file: 'struct-group-01-t.svg', label: 'group nesting' },
	{ file: 'coords-trans-01-b.svg', label: 'transforms' },
	{ file: 'painting-stroke-01-t.svg', label: 'stroke variations' },
	{ file: 'text-intro-01-t.svg', label: 'text intro' },
	{ file: 'paths-data-08-t.svg', label: 'paths: arcs' },
	{ file: 'pservers-grad-01-b.svg', label: 'linear gradients (unsupported)' },
] as const

const HOST_HTML = `<!doctype html><html><head><meta charset="utf-8"/><style>
html,body{margin:0;padding:0;background:#fff;}
#render{width:800px;height:600px;background:#fff;display:flex;align-items:center;justify-content:center;}
#render svg{max-width:100%;max-height:100%;}
</style></head><body>
<div id="render"></div>
<script type="module">
import { exportToSvg } from 'https://esm.sh/@excalidraw/excalidraw@0.18.0?bundle';
window.renderExcalidraw = async (elements) => {
  const c = document.getElementById('render');
  c.replaceChildren();
  if (!elements || elements.length === 0) { c.textContent = '(no elements)'; return false; }
  const svg = await exportToSvg({
    elements,
    appState: { exportBackground: false, exportWithDarkMode: false, viewBackgroundColor: '#ffffff' },
    files: null,
    exportPadding: 10,
  });
  c.appendChild(svg);
  return true;
};
window.__ready = true;
</script></body></html>`

for (const task of TASKS) {
	test(task.label, async ({ page }) => {
		const svg = await readFile(path.join(FIXTURES, task.file), 'utf8')
		const result = convert(svg)
		expect(result.hasErrors, 'converter should not error').toBe(false)
		const elements = result.content?.elements ?? []
		expect(
			elements.length,
			'converter should produce at least one element',
		).toBeGreaterThan(0)

		const consoleErrors: string[] = []
		page.on('pageerror', (err) => consoleErrors.push(err.message))
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text())
		})

		await page.setContent(HOST_HTML, { waitUntil: 'load' })
		await page.waitForFunction(
			() => (window as unknown as { __ready: boolean }).__ready === true,
			null,
			{ timeout: 30_000 },
		)

		const ok = await page.evaluate(
			async (els) =>
				await (
					window as unknown as {
						renderExcalidraw: (e: unknown) => Promise<boolean>
					}
				).renderExcalidraw(els),
			elements as unknown,
		)
		expect(ok, 'excalidraw rendered something').toBe(true)

		const slug = task.file.replace(/\.svg$/, '')
		await expect(page.locator('#render')).toHaveScreenshotOdiff(`${slug}.png`, {
			maxDiffPixelRatio: 0.02,
			antialiasing: true,
		})

		expect(consoleErrors, 'no console errors').toEqual([])
	})
}
