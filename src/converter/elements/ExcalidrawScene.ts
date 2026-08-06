import type { ExcalidrawGenericElement } from './ExcalidrawElement.ts'

class ExcalidrawScene {
	type = 'excalidraw'
	version = 2
	source = 'https://excalidraw.com'
	elements: ExcalidrawGenericElement[] = []

	constructor(elements: ExcalidrawGenericElement[] = []) {
		this.elements = elements
	}

	toExJSON(): {
		type: string
		version: number
		source: string
		elements: ExcalidrawGenericElement[]
	} {
		return {
			type: this.type,
			version: this.version,
			source: this.source,
			elements: this.elements.map((el) => ({ ...el })),
		}
	}
}

export default ExcalidrawScene
