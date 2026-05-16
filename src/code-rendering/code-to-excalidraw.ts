import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import { nanoid } from 'nanoid'
import { type BundledLanguage, createHighlighter } from 'shiki'

type ExcalidrawElementSkeleton = Parameters<
	typeof convertToExcalidrawElements
>[0][number]
type ExcalidrawScene = {
	type: string
	version: number
	source: string
	elements: ReturnType<typeof convertToExcalidrawElements>
	appState: { gridSize: number; viewBackgroundColor: string }
	files: Record<string, never>
}

const FONT_SIZE = 14
const CHAR_WIDTH = FONT_SIZE * 0.6
const LINE_HEIGHT = FONT_SIZE * 1.5
const PADDING = 16

function rectSkeleton(
	x: number,
	y: number,
	width: number,
	height: number,
	groupId: string,
	customData: Record<string, unknown>,
): ExcalidrawElementSkeleton {
	return {
		type: 'rectangle',
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
	text: string,
	x: number,
	y: number,
	color: string,
	groupId: string,
): ExcalidrawElementSkeleton {
	return {
		type: 'text',
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

export async function codeToExcalidraw(
	code: string,
	lang: BundledLanguage = 'typescript',
	origin = { x: 100, y: 100 },
): Promise<ExcalidrawScene> {
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
				textSkeleton(token.content, x, y, token.color ?? '#d4d4d4', groupId),
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
		origin.x,
		origin.y,
		maxX - origin.x + PADDING,
		maxY - origin.y + PADDING,
		groupId,
		meta,
	)

	const elements = convertToExcalidrawElements([rect, ...skeletons])

	return {
		type: 'excalidraw',
		version: 2,
		source: 'https://excalidraw.com',
		elements,
		appState: { gridSize: 20, viewBackgroundColor: '#ffffff' },
		files: {},
	}
}
