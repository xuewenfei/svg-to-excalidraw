import { mat4, vec3 } from 'gl-matrix'
import type Group from './elements/Group.ts'

/*
SVG transform attribute parsing.

The SVG transform attribute supports a fixed set of functions:
  matrix(a, b, c, d, e, f)
  translate(tx [, ty])
  scale(sx [, sy])
  rotate(angle [, cx, cy])
  skewX(angle)
  skewY(angle)

Numbers may be separated by commas and/or whitespace. We parse directly
into a mat4 (gl-matrix) so this code runs in any JS environment without
relying on the browser-only DOMMatrix global.

https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/transform
*/

const DEG_TO_RAD = Math.PI / 180

type TransformFn =
	| 'matrix'
	| 'translate'
	| 'scale'
	| 'rotate'
	| 'skewX'
	| 'skewY'

const isTransformFn = (name: string): name is TransformFn =>
	name === 'matrix' ||
	name === 'translate' ||
	name === 'scale' ||
	name === 'rotate' ||
	name === 'skewX' ||
	name === 'skewY'

const parseArgs = (raw: string): number[] => {
	const trimmed = raw.trim()
	if (!trimmed) return []
	return trimmed
		.split(/[\s,]+/)
		.filter((s) => s.length > 0)
		.map(Number)
}

const mat4FromAffine2D = (
	a: number,
	b: number,
	c: number,
	d: number,
	e: number,
	f: number,
): mat4 => mat4.fromValues(a, b, 0, 0, c, d, 0, 0, 0, 0, 1, 0, e, f, 0, 1)

const transformFnToMat = (name: TransformFn, args: number[]): mat4 => {
	switch (name) {
		case 'matrix': {
			const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = args
			return mat4FromAffine2D(a, b, c, d, e, f)
		}
		case 'translate': {
			const [tx = 0, ty = 0] = args
			return mat4FromAffine2D(1, 0, 0, 1, tx, ty)
		}
		case 'scale': {
			const [sx = 1, sy = sx] = args
			return mat4FromAffine2D(sx, 0, 0, sy, 0, 0)
		}
		case 'rotate': {
			const [angle = 0, cx = 0, cy = 0] = args
			const rad = angle * DEG_TO_RAD
			const cos = Math.cos(rad)
			const sin = Math.sin(rad)
			if (cx === 0 && cy === 0) {
				return mat4FromAffine2D(cos, sin, -sin, cos, 0, 0)
			}
			// rotate(a, cx, cy) = translate(cx, cy) * rotate(a) * translate(-cx, -cy)
			const tx = cx - cx * cos + cy * sin
			const ty = cy - cx * sin - cy * cos
			return mat4FromAffine2D(cos, sin, -sin, cos, tx, ty)
		}
		case 'skewX': {
			const [angle = 0] = args
			return mat4FromAffine2D(1, 0, Math.tan(angle * DEG_TO_RAD), 1, 0, 0)
		}
		case 'skewY': {
			const [angle = 0] = args
			return mat4FromAffine2D(1, Math.tan(angle * DEG_TO_RAD), 0, 1, 0, 0)
		}
	}
}

export const parseSVGTransform = (transformStr: string): mat4 => {
	const result = mat4.create()
	const fnMatches = transformStr.match(/(\w+)\s*\(([^)]*)\)/g)
	if (!fnMatches) return result

	for (const chunk of fnMatches) {
		const open = chunk.indexOf('(')
		const name = chunk.slice(0, open).trim()
		if (!isTransformFn(name)) {
			throw new Error(`Unsupported SVG transform function: "${name}"`)
		}
		const argStr = chunk.slice(open + 1, chunk.lastIndexOf(')'))
		const args = parseArgs(argStr)
		mat4.multiply(result, result, transformFnToMat(name, args))
	}

	return result
}

export function getElementMatrix(el: Element): mat4 {
	if (el.hasAttribute('transform')) {
		return parseSVGTransform(el.getAttribute('transform') || '')
	}
	return mat4.create()
}

export function getTransformMatrix(el: Element, groups: Group[]): mat4 {
	return groups
		.map(({ element }) => getElementMatrix(element))
		.concat([getElementMatrix(el)])
		.reduce((acc, mat) => mat4.multiply(acc, acc, mat), mat4.create())
}

export function transformPoints(
	points: number[][],
	transform: mat4,
): [number, number][] {
	return points.map(([x, y]) => {
		const [newX, newY] = vec3.transformMat4(
			vec3.create(),
			vec3.fromValues(x, y, 1),
			transform,
		)
		return [newX, newY]
	})
}
