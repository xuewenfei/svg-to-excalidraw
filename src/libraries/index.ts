import type { LibraryItem } from '@excalidraw/excalidraw/types'

export type Props = {
	name: string
	elements: LibraryItem['elements']
}

export const createLibraryItem = ({ name, elements }: Props): LibraryItem => {
	return {
		id: name,
		name,
		elements,
		created: new Date().getMilliseconds(),
		status: 'published',
	}
}
