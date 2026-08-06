import { mat4, vec3 } from 'gl-matrix'
import { pointsOnPath } from 'points-on-path'
import {
	filterAttrsToElementValues,
	get,
	getNum,
	has,
	pointsAttrToPoints,
	presAttrsToElementValues,
} from './attributes.ts'
import { NodeFilter } from './dom.ts'
import {
	createExDraw,
	createExEllipse,
	createExLine,
	createExRect,
	createExText,
	type ExcalidrawDraw,
	type ExcalidrawElementBase,
	type ExcalidrawEllipse,
	type ExcalidrawLine,
	type ExcalidrawRectangle,
	type ExcalidrawText,
	type Point,
} from './elements/ExcalidrawElement.ts'
import ExcalidrawScene from './elements/ExcalidrawScene.ts'
import Group, { getGroupAttrs } from './elements/Group.ts'
import { getTransformMatrix, transformPoints } from './transform.ts'
import type { FontFamily, TextAlign } from './types.ts'
import { dimensionsFromPoints, getWindingOrder, randomId } from './utils.ts'

const SUPPORTED_TAGS = [
	'svg',
	'path',
	'g',
	'use',
	'circle',
	'ellipse',
	'rect',
	'polyline',
	'polygon',
	'line',
	'text',
]

const mapTextAnchor = (anchor: string): TextAlign => {
	if (anchor === 'middle') return 'center'
	if (anchor === 'end') return 'right'
	return 'left'
}

const mapFontFamily = (family: string): FontFamily => {
	const lower = family.toLowerCase()
	if (
		lower.includes('mono') ||
		lower.includes('cascadia') ||
		lower.includes('courier') ||
		lower.includes('consolas')
	) {
		return 3
	}
	if (lower.includes('virgil') || lower.includes('hand') || lower === '') {
		// Default sans-serif fallback for typical web SVGs.
		return 2
	}
	return 2
}

const isCJK = (char: string): boolean => {
	const code = char.codePointAt(0) || 0
	return (
		(code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
		(code >= 0x3400 && code <= 0x4dbf) || // CJK Unified Ideographs Extension A
		(code >= 0x3000 && code <= 0x303f) || // CJK Symbols and Punctuation
		(code >= 0x3040 && code <= 0x309f) || // Hiragana
		(code >= 0x30a0 && code <= 0x30ff) || // Katakana
		(code >= 0xff00 && code <= 0xffef) || // Full-width forms
		(code >= 0xac00 && code <= 0xd7af) // Hangul Syllables
	)
}

const measureTextWidth = (text: string, fontSize: number): number => {
	// CJK glyphs and punctuation are usually wider than the nominal em square in
	// Excalidraw's fallback fonts, so leave extra headroom to avoid clipping.
	const cjkWidth = fontSize * 1.2
	const latinWidth = fontSize * 0.6
	let width = 0
	for (const char of text) {
		width += isCJK(char) ? cjkWidth : latinWidth
	}
	// Add a small buffer for font metrics differences between SVG and canvas.
	return Math.max(width + fontSize * 0.2, fontSize)
}

const nodeValidator = (node: Node): number => {
	// Only accept Element nodes (nodeType 1), not text nodes, comments, etc.
	if (node.nodeType !== 1) {
		return NodeFilter.FILTER_REJECT
	}

	const element = node as Element
	if (SUPPORTED_TAGS.includes(element.tagName.toLowerCase())) {
		return NodeFilter.FILTER_ACCEPT
	}

	return NodeFilter.FILTER_REJECT
}

export function createTreeWalker(dom: Node): TreeWalker {
	// Use the document that owns this node to create the TreeWalker
	const ownerDoc = dom.ownerDocument || (dom as Document)
	return ownerDoc.createTreeWalker(dom, NodeFilter.SHOW_ELEMENT, {
		acceptNode: nodeValidator,
	})
}

/**
 * Helper to simulate TreeWalker.nextSibling() for linkedom compatibility
 * Linkedom's TreeWalker only implements nextNode(), not nextSibling()
 */
function getNextSibling(tw: TreeWalker, currentNode: Node): Node | null {
	const startNode = currentNode
	let node = tw.nextNode()

	// Skip all descendants of startNode to get to its sibling
	while (node) {
		// Check if node is a descendant of startNode
		let parent = node.parentNode
		let isDescendant = false

		while (parent) {
			if (parent === startNode) {
				isDescendant = true
				break
			}
			parent = parent.parentNode
		}

		// If not a descendant, we've found the sibling or a node outside the subtree
		if (!isDescendant) {
			return node
		}

		node = tw.nextNode()
	}

	return null
}

type WalkerArgs = {
	root: Document
	tw: TreeWalker
	scene: ExcalidrawScene
	groups: Group[]
	skippedElements?: Set<string>
}

const presAttrs = (
	el: Element,
	groups: Group[],
): Partial<ExcalidrawElementBase> => {
	return {
		...getGroupAttrs(groups),
		...presAttrsToElementValues(el),
		...filterAttrsToElementValues(el),
	}
}

const skippedUseAttrs = ['id']
const allwaysPassedUseAttrs = [
	'x',
	'y',
	'width',
	'height',
	'href',
	'xlink:href',
]

/*
  "Most attributes on use do not override those already on the element
  referenced by use. (This differs from how CSS style attributes override
  those set 'earlier' in the cascade). Only the attributes x, y, width,
  height and href on the use element will override those set on the
  referenced element. However, any other attributes not set on the referenced
  element will be applied to the use element."

  Situation 1: Attr is set on defEl, NOT on useEl
    - result: use defEl attr
  Situation 2: Attr is on useEl, NOT on defEl
    - result: use the useEl attr
  Situation 3: Attr is on both useEl and defEl
    - result: use the defEl attr (Unless x, y, width, height, href, xlink:href)
*/
const getDefElWithCorrectAttrs = (defEl: Element, useEl: Element): Element => {
	const finalEl = Array.from(useEl.attributes).reduce((el, attr) => {
		if (skippedUseAttrs.includes(attr.value)) {
			return el
		}

		// Does defEl have the attr? If so, use it, else use the useEl attr
		if (
			!defEl.hasAttribute(attr.name) ||
			allwaysPassedUseAttrs.includes(attr.name)
		) {
			el.setAttribute(attr.name, useEl.getAttribute(attr.name) || '')
		}
		return el
	}, defEl.cloneNode() as Element)

	return finalEl
}

const walkers = {
	svg: (args: WalkerArgs) => {
		walk(args, args.tw.nextNode())
	},

	g: (args: WalkerArgs) => {
		const groupNode = args.tw.currentNode
		const nextArgs = {
			...args,
			tw: createTreeWalker(groupNode),
			groups: [...args.groups, new Group(groupNode as Element)],
		}

		walk(nextArgs, nextArgs.tw.nextNode())

		// Use helper function for linkedom compatibility (no native nextSibling)
		walk(args, getNextSibling(args.tw, groupNode))
	},

	use: (args: WalkerArgs) => {
		const { root, tw, scene } = args
		const useEl = tw.currentNode as Element

		const id = useEl.getAttribute('href') || useEl.getAttribute('xlink:href')

		if (!id) {
			throw new Error('unable to get id of use element')
		}

		const defEl = root.querySelector(id)

		if (!defEl) {
			throw new Error(`unable to find def element with id: ${id}`)
		}

		const tempScene = new ExcalidrawScene()

		const finalEl = getDefElWithCorrectAttrs(defEl, useEl)

		walk(
			{
				...args,
				scene: tempScene,
				tw: createTreeWalker(finalEl),
			},
			finalEl,
		)

		const exEl = tempScene.elements.pop()

		if (!exEl) {
			throw new Error('Unable to create ex element')
		}

		scene.elements.push(exEl)

		walk(args, args.tw.nextNode())
	},

	circle: (args: WalkerArgs): void => {
		const { tw, scene, groups } = args
		const el = tw.currentNode as Element

		const r = getNum(el, 'r', 0)
		const d = r * 2
		const x = getNum(el, 'x', 0) + getNum(el, 'cx', 0) - r
		const y = getNum(el, 'y', 0) + getNum(el, 'cy', 0) - r

		const mat = getTransformMatrix(el, groups)

		const m = mat4.fromValues(d, 0, 0, 0, 0, d, 0, 0, 0, 0, 1, 0, x, y, 0, 1)

		const result = mat4.multiply(mat4.create(), mat, m)

		const circle: ExcalidrawEllipse = {
			...createExEllipse(),
			...presAttrs(el, groups),
			x: result[12],
			y: result[13],
			width: result[0],
			height: result[5],
			groupIds: groups.map((g) => g.id),
		}

		scene.elements.push(circle)

		walk(args, tw.nextNode())
	},

	ellipse: (args: WalkerArgs): void => {
		const { tw, scene, groups } = args
		const el = tw.currentNode as Element

		const rx = getNum(el, 'rx', 0)
		const ry = getNum(el, 'ry', 0)
		const cx = getNum(el, 'cx', 0)
		const cy = getNum(el, 'cy', 0)
		const x = getNum(el, 'x', 0) + cx - rx
		const y = getNum(el, 'y', 0) + cy - ry
		const w = rx * 2
		const h = ry * 2

		const mat = getTransformMatrix(el, groups)

		const m = mat4.fromValues(w, 0, 0, 0, 0, h, 0, 0, 0, 0, 1, 0, x, y, 0, 1)

		const result = mat4.multiply(mat4.create(), mat, m)

		const ellipse: ExcalidrawEllipse = {
			...createExEllipse(),
			...presAttrs(el, groups),
			x: result[12],
			y: result[13],
			width: result[0],
			height: result[5],
			groupIds: groups.map((g) => g.id),
		}

		scene.elements.push(ellipse)

		walk(args, tw.nextNode())
	},

	line: (args: WalkerArgs) => {
		const { tw, scene, groups } = args
		const el = tw.currentNode as Element

		const x1 = getNum(el, 'x1', 0)
		const y1 = getNum(el, 'y1', 0)
		const x2 = getNum(el, 'x2', 0)
		const y2 = getNum(el, 'y2', 0)

		const mat = getTransformMatrix(el, groups)
		const [p1, p2] = transformPoints(
			[
				[x1, y1],
				[x2, y2],
			],
			mat,
		)

		const x = p1[0]
		const y = p1[1]
		const relativePoints: Point[] = [
			[0, 0],
			[p2[0] - x, p2[1] - y],
		]
		const [width, height] = dimensionsFromPoints(relativePoints)

		const line: ExcalidrawLine = {
			...createExLine(),
			...getGroupAttrs(groups),
			...presAttrsToElementValues(el),
			points: relativePoints,
			x,
			y,
			width,
			height,
			groupIds: groups.map((g) => g.id),
		}

		scene.elements.push(line)

		walk(args, args.tw.nextNode())
	},

	polygon: (args: WalkerArgs) => {
		const { tw, scene, groups } = args
		const el = tw.currentNode as Element

		const points = pointsAttrToPoints(el)

		const mat = getTransformMatrix(el, groups)

		const transformedPoints = transformPoints(points, mat)

		// The first point needs to be 0, 0, and all following points
		// are relative to the first point.
		const x = transformedPoints[0][0]
		const y = transformedPoints[0][1]

		const relativePoints = transformedPoints.map(
			([_x, _y]) => [_x - x, _y - y] as Point,
		)

		const [width, height] = dimensionsFromPoints(relativePoints)

		const line: ExcalidrawLine = {
			...createExLine(),
			...getGroupAttrs(groups),
			...presAttrsToElementValues(el),
			points: relativePoints.concat([[0, 0]] as Point[]),
			x,
			y,
			width,
			height,
		}

		scene.elements.push(line)

		walk(args, args.tw.nextNode())
	},

	polyline: (args: WalkerArgs) => {
		const { tw, scene, groups } = args
		const el = tw.currentNode as Element

		const mat = getTransformMatrix(el, groups)

		const points = pointsAttrToPoints(el)
		const transformedPoints = transformPoints(points, mat)

		// The first point needs to be 0, 0, and all following points
		// are relative to the first point.
		const x = transformedPoints[0][0]
		const y = transformedPoints[0][1]

		const relativePoints = transformedPoints.map(
			([_x, _y]) => [_x - x, _y - y] as Point,
		)

		const [width, height] = dimensionsFromPoints(relativePoints)

		const hasFill = has(el, 'fill')
		const fill = get(el, 'fill')

		const shouldFill = !hasFill || (hasFill && fill !== 'none')

		const line: ExcalidrawLine = {
			...createExLine(),
			...getGroupAttrs(groups),
			...presAttrsToElementValues(el),
			points: relativePoints.concat(shouldFill ? ([[0, 0]] as Point[]) : []),
			x,
			y,
			width,
			height,
		}

		scene.elements.push(line)

		walk(args, args.tw.nextNode())
	},

	rect: (args: WalkerArgs) => {
		const { tw, scene, groups } = args
		const el = tw.currentNode as Element

		const x = getNum(el, 'x', 0)
		const y = getNum(el, 'y', 0)
		const w = getNum(el, 'width', 0)
		const h = getNum(el, 'height', 0)

		const mat = getTransformMatrix(el, groups)

		const m = mat4.fromValues(w, 0, 0, 0, 0, h, 0, 0, 0, 0, 1, 0, x, y, 0, 1)

		const result = mat4.multiply(mat4.create(), mat, m)

		/*
		NOTE: Currently there doesn't seem to be a way to specify the border
			  radius of a rect within Excalidraw. This means that attributes
			  rx and ry can't be used.
		*/
		const isRound = el.hasAttribute('rx') || el.hasAttribute('ry')

		const rect: ExcalidrawRectangle = {
			...createExRect(),
			...presAttrs(el, groups),
			x: result[12],
			y: result[13],
			width: result[0],
			height: result[5],
			strokeSharpness: isRound ? 'round' : 'sharp',
		}

		scene.elements.push(rect)

		walk(args, args.tw.nextNode())
	},

	text: (args: WalkerArgs) => {
		const { tw, scene, groups } = args
		const el = tw.currentNode as Element

		const rawText = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
		if (!rawText) {
			walk(args, tw.nextNode())
			return
		}

		const fontSize = getNum(el, 'font-size', 16) || 16
		const fontFamily = mapFontFamily(get(el, 'font-family'))
		const textAlign = mapTextAnchor(get(el, 'text-anchor', 'start'))

		// SVG text y is on the baseline; Excalidraw y is top of the box.
		const baseline = Math.round(fontSize * 0.85)
		const lineHeight = Math.round(fontSize * 1.2)
		const width = measureTextWidth(rawText, fontSize)

		const svgX = getNum(el, 'x', 0)
		const svgY = getNum(el, 'y', 0)
		// Anchor offset so the SVG anchor lands at the intended point.
		const anchorOffset =
			textAlign === 'center' ? width / 2 : textAlign === 'right' ? width : 0
		const topLeftX = svgX - anchorOffset
		const topLeftY = svgY - baseline

		const mat = getTransformMatrix(el, groups)

		// Decompose the 2D affine portion of `mat` into rotation + uniform scale so
		// rotated/scaled parent groups affect the rendered text. Excalidraw text has
		// no skew, so any shear or non-uniform-scale component is dropped (documented
		// limitation — see tests/visual/FIDELITY-TODO.md).
		const a = mat[0]
		const b = mat[1]
		const c = mat[4]
		const d = mat[5]
		const scaleX = Math.hypot(a, b)
		const scaleY = Math.hypot(c, d)
		const rotation = scaleX === 0 ? 0 : Math.atan2(b, a)
		const uniformScale = Math.sqrt(Math.max(scaleX * scaleY, 0)) || 1
		const scaledFontSize = fontSize * uniformScale
		const scaledWidth = width * uniformScale
		const scaledHeight = lineHeight * uniformScale

		// Excalidraw rotates a text element about its own center, so place the box
		// so its center lands where the SVG transform maps the local center to.
		const localCenterX = topLeftX + width / 2
		const localCenterY = topLeftY + lineHeight / 2
		const worldCenter = vec3.transformMat4(
			vec3.create(),
			vec3.fromValues(localCenterX, localCenterY, 1),
			mat,
		)

		const textEl: ExcalidrawText = {
			...createExText(),
			...presAttrs(el, groups),
			x: worldCenter[0] - scaledWidth / 2,
			y: worldCenter[1] - scaledHeight / 2,
			width: scaledWidth,
			height: scaledHeight,
			angle: rotation,
			text: rawText,
			fontSize: scaledFontSize,
			fontFamily,
			textAlign,
			baseline,
			strokeColor: get(el, 'fill', '#000000') || '#000000',
			backgroundColor: 'transparent',
			groupIds: groups.map((g) => g.id),
		}

		scene.elements.push(textEl)

		walk(args, tw.nextNode())
	},

	path: (args: WalkerArgs) => {
		const { tw, scene, groups } = args
		const el = tw.currentNode as Element

		const mat = getTransformMatrix(el, groups)

		const points = pointsOnPath(get(el, 'd'))

		const fillColor = get(el, 'fill', 'black')
		const fillRule = get(el, 'fill-rule', 'nonzero')

		let elements: ExcalidrawDraw[] = []
		let localGroup = randomId()

		switch (fillRule) {
			case 'nonzero': {
				let initialWindingOrder = 'clockwise'

				elements = points.map((pointArr, idx): ExcalidrawDraw => {
					const tPoints: Point[] = transformPoints(pointArr, mat4.clone(mat))
					const x = tPoints[0][0]
					const y = tPoints[0][1]

					const [width, height] = dimensionsFromPoints(tPoints)

					const relativePoints = tPoints.map(
						([_x, _y]): Point => [_x - x, _y - y],
					)

					const windingOrder = getWindingOrder(relativePoints)
					if (idx === 0) {
						initialWindingOrder = windingOrder
						localGroup = randomId()
					}

					let backgroundColor = fillColor
					if (initialWindingOrder !== windingOrder) {
						backgroundColor = '#FFFFFF'
					}

					return {
						...createExDraw(),
						strokeWidth: 0,
						strokeColor: '#00000000',
						...presAttrs(el, groups),
						points: relativePoints,
						backgroundColor,
						width,
						height,
						x: x + getNum(el, 'x', 0),
						y: y + getNum(el, 'y', 0),
						groupIds: [localGroup],
					}
				})
				break
			}
			case 'evenodd':
				elements = points.map((pointArr, idx): ExcalidrawDraw => {
					const tPoints: Point[] = transformPoints(pointArr, mat4.clone(mat))
					const x = tPoints[0][0]
					const y = tPoints[0][1]

					const [width, height] = dimensionsFromPoints(tPoints)

					const relativePoints = tPoints.map(
						([_x, _y]): Point => [_x - x, _y - y],
					)

					if (idx === 0) {
						localGroup = randomId()
					}

					return {
						...createExDraw(),
						...presAttrs(el, groups),
						points: relativePoints,
						width,
						height,
						x: x + getNum(el, 'x', 0),
						y: y + getNum(el, 'y', 0),
					}
				})
				break
			default:
		}

		scene.elements = scene.elements.concat(elements)

		walk(args, tw.nextNode())
	},
}

// SVG elements whose children are templates/resources, not drawable content.
// We must not descend into these — linkedom's TreeWalker ignores acceptNode,
// so without explicit skipping their inner shapes leak into the scene.
const NON_RENDERED_CONTAINERS = new Set([
	'defs',
	'mask',
	'clippath',
	'filter',
	'pattern',
	'symbol',
	'marker',
	'lineargradient',
	'radialgradient',
])

export function walk(args: WalkerArgs, nextNode: Node | null): void {
	if (!nextNode) {
		return
	}

	const nodeName = nextNode.nodeName.toLowerCase() as keyof typeof walkers

	if (NON_RENDERED_CONTAINERS.has(nodeName)) {
		walk(args, getNextSibling(args.tw, nextNode))
		return
	}

	// Subtrees referencing an unsupported mask or clip-path would render wrong
	// without that mask applied. Drop them rather than emit phantom shapes.
	if (
		nextNode.nodeType === 1 &&
		((nextNode as Element).hasAttribute('mask') ||
			(nextNode as Element).hasAttribute('clip-path'))
	) {
		walk(args, getNextSibling(args.tw, nextNode))
		return
	}

	if (walkers[nodeName]) {
		walkers[nodeName](args)
	} else {
		// Skip unsupported nodes and continue walking
		// (linkedom doesn't support TreeWalker acceptNode filtering)

		// Track skipped elements for debugging
		if (args.skippedElements && nextNode.nodeType === 1) {
			const element = nextNode as Element
			args.skippedElements.add(element.tagName.toLowerCase())
		}

		walk(args, args.tw.nextNode())
	}
}
