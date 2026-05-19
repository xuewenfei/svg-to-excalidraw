import chroma from 'chroma-js'
import type { ExcalidrawElementBase } from './elements/ExcalidrawElement.ts'

export function hexWithAlpha(color: string, alpha: number): string {
	return chroma(color).alpha(alpha).css()
}

export function has(el: Element, attr: string): boolean {
	return el.hasAttribute(attr)
}

export function get(el: Element, attr: string, backup?: string): string {
	return el.getAttribute(attr) || backup || ''
}

export function getNum(el: Element, attr: string, backup?: number): number {
	const numVal = Number(get(el, attr))
	return Number.isNaN(numVal) ? backup || 0 : numVal
}

// Resolve a `fill="url(#id)"` reference to a flat color. Excalidraw can't render
// SVG gradients, so we pick the perceptual average of the gradient's <stop> colors
// (weighted by stop-opacity) as a reasonable still-recognizable substitute.
function resolveGradientFallback(el: Element, gradId: string): string | null {
	const doc = el.ownerDocument
	if (!doc) return null

	// Walk the xlink:href chain — a gradient may inherit stops from another
	// gradient. Cap the depth to avoid cycles in malformed docs.
	let grad: Element | null = doc.getElementById(gradId)
	const seen = new Set<string>()
	let stops: Element[] = []
	for (let i = 0; grad && i < 8; i++) {
		const tag = grad.tagName.toLowerCase()
		if (tag !== 'lineargradient' && tag !== 'radialgradient') return null
		stops = Array.from(grad.getElementsByTagName('stop'))
		if (stops.length > 0) break

		const href =
			grad.getAttribute('href') ?? grad.getAttribute('xlink:href') ?? ''
		const nextId = /^#(.+)$/.exec(href)?.[1]
		if (!nextId || seen.has(nextId)) return null
		seen.add(nextId)
		grad = doc.getElementById(nextId)
	}

	if (stops.length === 0) return null

	const colors = stops
		.map((s) => s.getAttribute('stop-color') ?? '#000000')
		.filter((c) => c.length > 0)
	const [first, ...rest] = colors
	if (!first) return null
	if (rest.length === 0) return chroma(first).hex()

	try {
		return chroma.average(colors, 'lab').hex()
	} catch {
		return first
	}
}

const presAttrs = {
	stroke: 'stroke',
	'stroke-opacity': 'stroke-opacity',
	'stroke-width': 'stroke-width',
	fill: 'fill',
	'fill-opacity': 'fill-opacity',
	opacity: 'opacity',
} as const

type ExPartialElement = Partial<ExcalidrawElementBase>

type AttrHandlerArgs = {
	el: Element
	exVals: ExPartialElement
}

type PresAttrHandlers = {
	[key in keyof typeof presAttrs]: (args: AttrHandlerArgs) => void
}

const attrHandlers: PresAttrHandlers = {
	stroke: ({ el, exVals }) => {
		const strokeColor = get(el, 'stroke')

		exVals.strokeColor = has(el, 'stroke-opacity')
			? hexWithAlpha(strokeColor, getNum(el, 'stroke-opacity'))
			: strokeColor
	},

	'stroke-opacity': ({ el, exVals }) => {
		exVals.strokeColor = hexWithAlpha(
			get(el, 'stroke', '#000000'),
			getNum(el, 'stroke-opacity'),
		)
	},

	'stroke-width': ({ el, exVals }) => {
		exVals.strokeWidth = getNum(el, 'stroke-width')
	},

	fill: ({ el, exVals }) => {
		const fill = get(el, `fill`)

		if (fill === 'none') {
			exVals.backgroundColor = '#00000000'
			return
		}

		const gradId = /^url\(#([^)]+)\)$/.exec(fill)?.[1]
		if (gradId) {
			exVals.backgroundColor = resolveGradientFallback(el, gradId) ?? fill
			return
		}

		exVals.backgroundColor = fill
	},

	'fill-opacity': ({ el, exVals }) => {
		exVals.backgroundColor = hexWithAlpha(
			get(el, 'fill', '#000000'),
			getNum(el, 'fill-opacity'),
		)
	},

	opacity: ({ el, exVals }) => {
		exVals.opacity = getNum(el, 'opacity', 100)
	},
}

// Presentation Attributes for SVG Elements:
// https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/Presentation
export function presAttrsToElementValues(
	el: Element,
): Partial<ExcalidrawElementBase> {
	const exVals = Array.from(el.attributes).reduce((exVals, attr) => {
		const name = attr.name

		if (Object.keys(attrHandlers).includes(name)) {
			attrHandlers[name as keyof PresAttrHandlers]({ el, exVals })
		}

		return exVals
	}, {} as ExPartialElement)

	return exVals
}

type FilterAttrs = Partial<
	Pick<ExcalidrawElementBase, 'x' | 'y' | 'width' | 'height'>
>

export function filterAttrsToElementValues(el: Element): FilterAttrs {
	const filterVals: FilterAttrs = {}

	if (has(el, 'x')) {
		filterVals.x = getNum(el, 'x')
	}

	if (has(el, 'y')) {
		filterVals.y = getNum(el, 'y')
	}

	if (has(el, 'width')) {
		filterVals.width = getNum(el, 'width')
	}

	if (has(el, 'height')) {
		filterVals.height = getNum(el, 'height')
	}

	return filterVals
}

export function pointsAttrToPoints(el: Element): number[][] {
	if (!has(el, 'points')) return []
	const nums = get(el, 'points')
		.trim()
		.split(/[\s,]+/)
		.filter(Boolean)
		.map(parseFloat)
		.filter((n) => !Number.isNaN(n))
	const points: number[][] = []
	for (let i = 0; i + 1 < nums.length; i += 2) {
		points.push([nums[i], nums[i + 1]])
	}
	return points
}
