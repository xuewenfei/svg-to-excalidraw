import { parseHTML } from 'linkedom'

const {
	window: lwin,
	document,
	Element,
	HTMLElement,
	Node,
	NodeFilter,
	Event,
	CustomEvent,
	MutationObserver,
} = parseHTML('<!DOCTYPE html><html><body></body></html>')

const noop = () => undefined
const canvasCtx = new Proxy({} as Record<string, unknown>, {
	get: (_, k: string) => {
		if (k === 'measureText')
			return (text: string) => ({ width: text.length * 8 })
		if (k === 'then') return undefined
		return noop
	},
})
const canvas = {
	getContext: () => canvasCtx,
	width: 300,
	height: 150,
	style: {},
}
const origCreate = document.createElement.bind(document)
// biome-ignore lint/suspicious/noExplicitAny: shim
;(document as any).createElement = (tag: string, ...args: unknown[]) =>
	tag === 'canvas' ? canvas : origCreate(tag, ...(args as []))

// biome-ignore lint/suspicious/noExplicitAny: shim
const loc: any = {
	origin: 'http://localhost',
	href: 'http://localhost',
	hostname: 'localhost',
	protocol: 'http:',
	pathname: '/',
}

class FontFace {
	family: string
	constructor(family: string) {
		this.family = family
	}
	load() {
		return Promise.resolve(this)
	}
}
class FontFaceSet extends Set {
	ready = Promise.resolve(this)
	override add(f: FontFace) {
		super.add(f)
		return this
	}
	check() {
		return true
	}
	load() {
		return Promise.resolve([])
	}
}

Object.assign(globalThis, {
	window: lwin,
	document,
	Element,
	HTMLElement,
	Node,
	NodeFilter,
	Event,
	CustomEvent,
	MutationObserver,
	location: loc,
	devicePixelRatio: 1,
	addEventListener: noop,
	removeEventListener: noop,
	requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
	cancelAnimationFrame: clearTimeout,
	getComputedStyle: () => ({ getPropertyValue: () => '' }),
	matchMedia: () => ({
		matches: false,
		addListener: noop,
		removeListener: noop,
	}),
	ResizeObserver: class {
		observe = noop
		unobserve = noop
		disconnect = noop
	},
	IntersectionObserver: class {
		observe = noop
		unobserve = noop
		disconnect = noop
	},
	performance: { now: Date.now },
	FontFace,
	fonts: new FontFaceSet(),
})
lwin.location = loc
lwin.devicePixelRatio = 1
