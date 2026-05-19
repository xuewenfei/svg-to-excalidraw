import type {
	convertToExcalidrawElements as _convertToExcalidrawElements,
	ExcalidrawElementSkeleton,
} from '@excalidraw/excalidraw/data/transform'
import { nanoid } from 'nanoid'
import { type BundledLanguage, createHighlighter } from 'shiki'

/** Raw Excalidraw elements array, ready to embed into any scene. */
export type CodeBlockElements = ReturnType<typeof _convertToExcalidrawElements>

// fractional-indexing compatible: "a0".."a9", "aA".."aZ", "aa".."az" (62 slots), then "b0"..
const IDX = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
function elementIndex(i: number): string {
	const hi = Math.floor(i / IDX.length)
	const lo = i % IDX.length
	return `${String.fromCharCode(97 + hi)}${IDX[lo]}`
}

function fillDefaults(skeleton: ExcalidrawElementSkeleton, i: number) {
	const base = {
		frameId: null as null,
		index: elementIndex(i),
		seed: Math.floor(Math.random() * 2 ** 31),
		version: 2 as const,
		versionNonce: Math.floor(Math.random() * 2 ** 31),
		isDeleted: false as const,
		boundElements: null as null,
		updated: Date.now(),
		link: null as null,
		locked: false as const,
	}
	if (skeleton.type === 'text') {
		return {
			...skeleton,
			...base,
			lineHeight: 1.2,
			originalText: skeleton.text,
			autoResize: true as const,
			containerId: null as null,
		}
	}
	return { ...skeleton, ...base }
}

function convertToExcalidrawElements(
	skeletons: ExcalidrawElementSkeleton[],
): CodeBlockElements {
	return skeletons.map((s, i) => fillDefaults(s, i)) as CodeBlockElements
}

/**
 * The result of `codeToExcalidraw`.
 *
 * - `elements` — raw element array for embedding into an existing scene
 * - `scene` — complete `.excalidraw` file document, ready to save or display
 */
export type CodeBlockResult = {
	elements: CodeBlockElements
}

const FONT_SIZE = 14
const CHAR_WIDTH = FONT_SIZE * 0.6
const LINE_HEIGHT = FONT_SIZE * 1.5
const PADDING = 16

function rectSkeleton(
	id: string,
	x: number,
	y: number,
	width: number,
	height: number,
	groupId: string,
	customData: Record<string, unknown>,
): ExcalidrawElementSkeleton {
	return {
		type: 'rectangle',
		id,
		x,
		y,
		width,
		height,
		groupIds: [groupId],
		strokeColor: '#3c3c3c',
		backgroundColor: '#1e1e1e',
		fillStyle: 'solid',
		strokeWidth: 1,
		strokeStyle: 'solid',
		roughness: 0,
		roundness: { type: 3, value: 6 },
		customData,
	}
}

function textSkeleton(
	id: string,
	text: string,
	x: number,
	y: number,
	color: string,
	groupId: string,
): ExcalidrawElementSkeleton {
	return {
		type: 'text',
		id,
		text,
		x,
		y,
		width: text.length * CHAR_WIDTH,
		height: FONT_SIZE,
		fontSize: FONT_SIZE,
		fontFamily: 3,
		strokeColor: color,
		groupIds: [groupId],
		textAlign: 'left',
		verticalAlign: 'top',
	}
}

/**
 * Renders a syntax-highlighted code block as Excalidraw elements.
 *
 * Each call generates fresh element IDs, so multiple results can be composed
 * into the same scene without conflicts.
 *
 * Returns both the raw `elements` array (for embedding into an existing scene)
 * and a standalone `scene` document (`.excalidraw` file format).
 *
 * @param code   - Source code string to render.
 * @param lang   - Shiki language identifier. Defaults to `'typescript'`.
 * @param origin - Top-left position of the block in scene coordinates.
 *
 * @example
 * ```ts
 * const { elements, scene } = await codeToExcalidraw(code, 'typescript')
 * // embed into a larger scene:
 * myScene.elements.push(...elements)
 * // or write a standalone file:
 * await Bun.write('code.excalidraw', JSON.stringify(scene))
 * ```
 */
export async function codeToExcalidraw(
	code: string,
	lang: BundledLanguage = 'typescript',
	origin = { x: 100, y: 100 },
): Promise<CodeBlockResult> {
	const highlighter = await createHighlighter({
		themes: ['dark-plus'],
		langs: [lang],
	})

	const { tokens: lines } = highlighter.codeToTokens(code, {
		lang,
		theme: 'dark-plus',
	})

	const groupId = nanoid()
	const skeletons: ExcalidrawElementSkeleton[] = []

	lines.forEach((lineTokens, lineIndex) => {
		let x = origin.x + PADDING
		const y = origin.y + PADDING + lineIndex * LINE_HEIGHT
		lineTokens.forEach((token) => {
			if (token.content.trim() === '') {
				x += token.content.length * CHAR_WIDTH
				return
			}
			skeletons.push(
				textSkeleton(
					nanoid(),
					token.content,
					x,
					y,
					token.color ?? '#d4d4d4',
					groupId,
				),
			)
			x += token.content.length * CHAR_WIDTH
		})
	})

	const maxX = Math.max(...skeletons.map((el) => (el.x ?? 0) + (el.width ?? 0)))
	const maxY = Math.max(
		...skeletons.map((el) => (el.y ?? 0) + (el.height ?? 0)),
	)

	const meta = {
		type: 'code-block',
		lang,
		source: code,
		generator: 'codeToExcalidraw',
		theme: 'dark-plus',
		fontSize: FONT_SIZE,
		charWidth: CHAR_WIDTH,
		lineHeight: LINE_HEIGHT,
		padding: PADDING,
	}

	const rect = rectSkeleton(
		nanoid(),
		origin.x,
		origin.y,
		maxX - origin.x + PADDING,
		maxY - origin.y + PADDING,
		groupId,
		meta,
	)

	const elements = convertToExcalidrawElements([rect, ...skeletons])

	return { elements }
}
