import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import path from 'node:path'
import { convert } from '../src/converter'

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
		expect(result.content.type).toBe('excalidraw')
		expect(result.content.version).toBe(2)
		expect(result.content.elements).toBeArray()
		expect(result.content.elements.length).toBeGreaterThan(0)

		const element = result.content.elements[0]
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
		expect(result.content.elements.length).toBeGreaterThan(0)

		const element = result.content.elements[0]
		expect(element.type).toBe('rectangle')
	})

	test('handles unsupported elements gracefully', () => {
		const svgWithUnsupported = '<svg><invalid>not valid svg</invalid></svg>'

		const result = convert(svgWithUnsupported)

		expect(result.hasErrors).toBe(false)
		expect(result.content.elements.length).toBe(0)
	})

	test('returns warnings array', () => {
		const svgString = `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="20"/>
      </svg>
    `

		const result = convert(svgString)

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
		expect(result.content.elements.length).toBe(1)

		const element = result.content.elements[0] as {
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

	test.skip('converts ollama file', async () => {
		const filePath = '/Users/awhiteside/Downloads/creative-thinking-card.svg'
		const parsedPath = path.parse(filePath)
		const svgFileContents = fs.readFileSync(filePath).toString('utf-8')
		const result = convert(svgFileContents)
		if (result.hasErrors) {
			console.error(result.errors)
		} else {
			const outputPath = `${parsedPath.dir}/${parsedPath.name}.excalidraw.txt`
			fs.writeFileSync(outputPath, JSON.stringify(result.content, null, null))
		}
	})
})
