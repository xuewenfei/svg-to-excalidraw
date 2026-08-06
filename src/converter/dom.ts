/**
 * DOM API provider using linkedom
 * Works in browser, Node.js, and serverless/edge environments
 */

import { DOMParser as LinkedDOMParser, parseHTML } from 'linkedom/worker'

// Initialize linkedom DOM
const dom = parseHTML('<!DOCTYPE html>')

// Export DOM APIs
export const DOMParser: LinkedDOMParser = new LinkedDOMParser()
export const document: Document = dom.document

// NodeFilter is available on the global/window object from linkedom
// We need to get it from the parsed HTML window object
export const NodeFilter = {
	SHOW_ALL: 0xffffffff,
	SHOW_ELEMENT: 0x1,
	SHOW_ATTRIBUTE: 0x2,
	SHOW_TEXT: 0x4,
	SHOW_CDATA_SECTION: 0x8,
	SHOW_ENTITY_REFERENCE: 0x10,
	SHOW_ENTITY: 0x20,
	SHOW_PROCESSING_INSTRUCTION: 0x40,
	SHOW_COMMENT: 0x80,
	SHOW_DOCUMENT: 0x100,
	SHOW_DOCUMENT_TYPE: 0x200,
	SHOW_DOCUMENT_FRAGMENT: 0x400,
	SHOW_NOTATION: 0x800,
	FILTER_ACCEPT: 1,
	FILTER_REJECT: 2,
	FILTER_SKIP: 3,
}
