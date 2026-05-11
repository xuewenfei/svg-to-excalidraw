import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { convert } from '../src/converter'

const FIXTURES_DIR = path.join(import.meta.dir, 'fixtures')

const readFixture = async (name: string): Promise<string> =>
	Bun.file(path.join(FIXTURES_DIR, name)).text()

describe('SVG to Excalidraw conversion', () => {
	test('converts a simple circle to Excalidraw format', () => {
		const svgString = `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="20" fill="red" stroke="black" stroke-width="2"/>
      </svg>
    `

		const result = convert(svgString)

		expect(result.hasErrors).toBe(false)
		expect(result.content).toBeDefined()
		expect(result.content?.type).toBe('excalidraw')
		expect(result.content?.version).toBe(2)
		expect(result.content?.elements).toBeArray()
		expect(result.content?.elements.length).toBeGreaterThan(0)

		const element = result.content!.elements[0]
		expect(element.type).toBe('ellipse')
		expect(element.x).toBeDefined()
		expect(element.y).toBeDefined()
		expect(element.width).toBeDefined()
		expect(element.height).toBeDefined()
	})

	test('converts a simple rectangle to Excalidraw format', () => {
		const svgString = `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="30" height="40" fill="blue"/>
      </svg>
    `

		const result = convert(svgString)

		expect(result.hasErrors).toBe(false)
		expect(result.content?.elements.length).toBe(1)
		expect(result.content!.elements[0].type).toBe('rectangle')
	})

	test('handles unsupported elements gracefully', () => {
		const result = convert('<svg><invalid>not valid svg</invalid></svg>')

		expect(result.hasErrors).toBe(false)
		expect(result.content?.elements.length).toBe(0)
	})

	test('returns warnings array', () => {
		const result = convert(`
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="20"/>
      </svg>
    `)

		expect(result.warnings).toBeArray()
	})

	test('converts a text element to Excalidraw text', () => {
		const svgString = `
      <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <text x="20" y="40" font-size="24" font-family="Helvetica" fill="#333" text-anchor="middle">Hello</text>
      </svg>
    `

		const result = convert(svgString)

		expect(result.hasErrors).toBe(false)
		expect(result.content?.elements.length).toBe(1)

		const element = result.content!.elements[0] as {
			type: string
			text: string
			fontSize: number
			textAlign: string
			strokeColor: string
		}
		expect(element.type).toBe('text')
		expect(element.text).toBe('Hello')
		expect(element.fontSize).toBe(24)
		expect(element.textAlign).toBe('center')
		expect(element.strokeColor).toBe('#333')
	})

	test('converts a line element', () => {
		const result = convert(`
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <line x1="10" y1="20" x2="60" y2="80" stroke="black"/>
      </svg>
    `)

		expect(result.hasErrors).toBe(false)
		expect(result.content?.elements.length).toBe(1)
		const el = result.content!.elements[0] as unknown as {
			type: string
			x: number
			y: number
			points: [number, number][]
		}
		expect(el.type).toBe('line')
		expect(el.x).toBe(10)
		expect(el.y).toBe(20)
		expect(el.points).toEqual([
			[0, 0],
			[50, 60],
		])
	})

	test('applies translate transforms on a group to its children', () => {
		const result = convert(`
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(100, 50)">
          <rect x="10" y="20" width="30" height="40"/>
        </g>
      </svg>
    `)

		expect(result.hasErrors).toBe(false)
		const el = result.content!.elements[0]
		expect(el.type).toBe('rectangle')
		expect(el.x).toBeCloseTo(110)
		expect(el.y).toBeCloseTo(70)
		expect(el.width).toBeCloseTo(30)
		expect(el.height).toBeCloseTo(40)
	})

	test('does not leak elements from <defs>', () => {
		// Mask + linearGradient inside defs must not produce drawable rects.
		const result = convert(`
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="m">
            <rect x="0" y="0" width="50" height="50" fill="white"/>
          </mask>
          <linearGradient id="g">
            <stop offset="0%" stop-color="red"/>
          </linearGradient>
        </defs>
        <rect x="10" y="10" width="80" height="80" fill="blue"/>
      </svg>
    `)

		expect(result.hasErrors).toBe(false)
		expect(result.content?.elements.length).toBe(1)
		expect(result.content!.elements[0].x).toBe(10)
	})

	test('skips subtrees that reference an unsupported mask', () => {
		// The masked rect would render in the wrong place without mask support,
		// so the whole masked group is dropped.
		const result = convert(`
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="m">
            <rect x="0" y="0" width="100" height="100" fill="white"/>
          </mask>
        </defs>
        <rect x="10" y="10" width="50" height="50" fill="green"/>
        <g mask="url(#m)">
          <rect x="-200" y="0" width="100" height="100" fill="red"/>
        </g>
      </svg>
    `)

		expect(result.hasErrors).toBe(false)
		expect(result.content?.elements.length).toBe(1)
		expect(result.content!.elements[0].x).toBe(10)
	})

	test('drops elements hidden with display:none via preprocessor', () => {
		const result = convert(`
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="20" height="20" fill="blue"/>
        <rect x="40" y="40" width="20" height="20" fill="red" display="none"/>
      </svg>
    `)

		expect(result.hasErrors).toBe(false)
		expect(result.content?.elements.length).toBe(1)
		expect(result.content!.elements[0].x).toBe(10)
	})

	test('converts the skeleton-loader fixture without phantom shimmer rect', async () => {
		// Real-world SVG that previously produced an off-canvas rect at x=-160
		// (the shimmer overlay) plus duplicate mask rects. The output should be
		// exactly the visible card plus the 4 grey bars.
		const svg = await readFixture('skeleton-loader.svg')
		const result = convert(svg)

		expect(result.hasErrors).toBe(false)
		const elements = result.content!.elements

		expect(elements.length).toBe(5)

		// Card
		expect(elements[0]).toMatchObject({
			type: 'rectangle',
			x: 6,
			y: 6,
			width: 348,
			height: 108,
		})

		// Four grey bars, all within the card bounds
		for (let i = 1; i <= 4; i++) {
			expect(elements[i].type).toBe('rectangle')
			expect(elements[i].x).toBe(28)
			expect(elements[i].y).toBeGreaterThanOrEqual(26)
			expect(elements[i].y).toBeLessThanOrEqual(86)
		}

		// No element should be off-canvas (the old shimmer rect was at x=-160)
		for (const el of elements) {
			expect(el.x).toBeGreaterThanOrEqual(0)
		}
	})
})
