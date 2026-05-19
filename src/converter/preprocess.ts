import { DOMParser } from 'linkedom/worker'

const parser = new DOMParser()

const PRESENTATION_ATTRS = new Set([
	'fill',
	'fill-opacity',
	'fill-rule',
	'stroke',
	'stroke-width',
	'stroke-opacity',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-dasharray',
	'stroke-dashoffset',
	'opacity',
	'display',
	'visibility',
	'color',
	'font-family',
	'font-size',
	'font-weight',
	'font-style',
	'text-anchor',
	'dominant-baseline',
	'clip-path',
	'clip-rule',
	'transform',
	'marker-start',
	'marker-mid',
	'marker-end',
])

type LinkedDoc = {
	querySelectorAll(s: string): ArrayLike<Element>
	createTreeWalker(n: Node, w: number): TreeWalker
	toString(): string
}

function qs(doc: LinkedDoc, selector: string): Element[] {
	return Array.from(doc.querySelectorAll(selector))
}

function removeElements(doc: LinkedDoc, selector: string) {
	for (const el of qs(doc, selector)) el.remove()
}

function removeComments(doc: LinkedDoc & Node) {
	const walker = (doc as unknown as Document).createTreeWalker(
		doc as unknown as Node,
		0x80,
	)
	const toRemove: Node[] = []
	let current = walker.nextNode()
	while (current) {
		toRemove.push(current)
		current = walker.nextNode()
	}
	for (const n of toRemove) n.parentNode?.removeChild(n)
}

function inlineStylesheet(doc: LinkedDoc) {
	const styleEls = qs(doc, 'style')
	if (styleEls.length === 0) return

	const rules: Array<{
		selector: string
		declarations: Record<string, string>
	}> = []

	for (const styleEl of styleEls) {
		const text = styleEl.textContent ?? ''
		const ruleRe = /([^{}]+)\{([^}]*)\}/g
		let m: RegExpExecArray | null
		// biome-ignore lint/suspicious/noAssignInExpressions: intentional regex loop
		while ((m = ruleRe.exec(text)) !== null) {
			const selector = m[1].trim()
			const declarations: Record<string, string> = {}
			for (const decl of m[2].split(';')) {
				const idx = decl.indexOf(':')
				if (idx === -1) continue
				const prop = decl.slice(0, idx).trim()
				const val = decl.slice(idx + 1).trim()
				if (prop) declarations[prop] = val
			}
			if (selector && Object.keys(declarations).length > 0) {
				rules.push({ selector, declarations })
			}
		}
		styleEl.remove()
	}

	for (const { selector, declarations } of rules) {
		try {
			for (const el of qs(doc, selector)) {
				for (const [prop, val] of Object.entries(declarations)) {
					if (!el.hasAttribute(prop)) el.setAttribute(prop, val)
				}
			}
		} catch {
			// ignore unparseable selectors
		}
	}
}

function convertStyleAttrToAttrs(el: Element) {
	const style = el.getAttribute('style')
	if (!style) return
	for (const decl of style.split(';')) {
		const idx = decl.indexOf(':')
		if (idx === -1) continue
		const prop = decl.slice(0, idx).trim()
		const val = decl.slice(idx + 1).trim()
		if (prop && PRESENTATION_ATTRS.has(prop) && !el.hasAttribute(prop)) {
			el.setAttribute(prop, val)
		}
	}
	el.removeAttribute('style')
}

function isHidden(el: Element): boolean {
	const display = el.getAttribute('display')
	const visibility = el.getAttribute('visibility')
	const opacity = el.getAttribute('opacity')
	return (
		display === 'none' ||
		visibility === 'hidden' ||
		(opacity !== null && Number.parseFloat(opacity) === 0)
	)
}

export const preprocessSvg = (svg: string): string => {
	try {
		const doc = parser.parseFromString(
			svg,
			'image/svg+xml',
		) as unknown as LinkedDoc & Node

		removeComments(doc)
		removeElements(doc, 'metadata, desc, title, script')

		inlineStylesheet(doc)

		for (const el of qs(doc, '*')) {
			convertStyleAttrToAttrs(el)
			if (isHidden(el)) el.remove()
		}

		for (const el of qs(doc, 'g, defs, symbol, marker')) {
			if (el.childElementCount === 0) el.remove()
		}

		return doc.toString()
	} catch {
		return svg
	}
}
