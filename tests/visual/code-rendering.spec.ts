import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { toHaveScreenshotOdiff } from 'playwright-odiff'

expect.extend({ toHaveScreenshotOdiff })

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GENERATOR = path.join(HERE, '../../src/code-rendering/generate-scene.ts')

type Scene = { elements: unknown[] }

// codeToExcalidraw imports @excalidraw/excalidraw, which is a browser-only library.
// Its dist imports open-color as a bare JSON module and roughjs without .js extensions —
// both of which break under Node.js ESM (Playwright's runtime). Bun handles both fine,
// so we run generation in a Bun subprocess rather than importing directly here.
// DO NOT replace this with a direct import of codeToExcalidraw.
function generateScene(code: string, lang: string): Scene {
	const result = spawnSync('bun', [GENERATOR, code, lang], {
		encoding: 'utf8',
		timeout: 30_000,
	})
	if (result.status !== 0)
		throw new Error(result.stderr || 'generate-scene failed')
	return JSON.parse(result.stdout) as Scene
}

const HOST_HTML = `<!doctype html><html><head><meta charset="utf-8"/><style>
html,body{margin:0;padding:0;background:#fff;}
#render{width:800px;height:600px;background:#fff;display:flex;align-items:flex-start;justify-content:flex-start;}
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
    appState: { exportBackground: true, exportWithDarkMode: false, viewBackgroundColor: '#ffffff' },
    files: null,
    exportPadding: 20,
  });
  c.appendChild(svg);
  return true;
};
window.__ready = true;
</script></body></html>`

const SAMPLES = [
	{
		label: 'typescript interface',
		lang: 'typescript' as const,
		code: `interface StreamCardView {
  title: Slot
  body: Slot
  status: string | null
}`,
	},
	{
		label: 'typescript function',
		lang: 'typescript' as const,
		code: `async function fetchUser(id: string): Promise<User> {
  const res = await fetch(\`/api/users/\${id}\`)
  if (!res.ok) throw new Error('not found')
  return res.json() as Promise<User>
}`,
	},
	{
		label: 'json object',
		lang: 'json' as const,
		code: `{
  "name": "svg-to-excalidraw",
  "version": "0.0.18",
  "type": "module"
}`,
	},
] as const

for (const sample of SAMPLES) {
	test(`code block: ${sample.label}`, async ({ page }) => {
		const scene = generateScene(sample.code, sample.lang)

		expect(scene.elements.length, 'scene should have elements').toBeGreaterThan(
			0,
		)

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
			scene.elements as unknown,
		)
		expect(ok, 'excalidraw rendered something').toBe(true)

		const slug = sample.label.replace(/\s+/g, '-')
		await expect(page.locator('#render')).toHaveScreenshotOdiff(
			`code-${slug}.png`,
			{
				maxDiffPixelRatio: 0.02,
				antialiasing: true,
			},
		)

		expect(consoleErrors, 'no console errors').toEqual([])
	})
}