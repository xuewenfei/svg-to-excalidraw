import {describe, expect, test} from 'bun:test'
import {convert} from '../src/converter'
import * as fs from "node:fs";
import path from "node:path";

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

	test.skip('converts ollama file', async () => {
		const filePath = '/Users/awhiteside/Downloads/ollama_omg.svg'
		const parsedPath = path.parse(filePath)
		const svgFileContents = fs.readFileSync(filePath).toString('utf-8');
		const result = convert(svgFileContents)
		if (result.hasErrors) {
			console.error(result.errors)
		} else {
			const outputPath = `${parsedPath.dir}/${parsedPath.name}.excalidraw.txt`
			fs.writeFileSync(outputPath, JSON.stringify(result.content, null, null))
		}
	})
})
