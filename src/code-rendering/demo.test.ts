// --- test ---
import './browser-shim.ts'
import { codeToExcalidraw } from './code-to-excalidraw.ts'

const code = `interface StreamCardView{
  title: Slot
  body: Slot
  status: string | null
}`

const { elements } = await codeToExcalidraw(code, 'typescript')

// Verify metadata round-trip via rect element (index 0)
const frameMeta = elements[0].customData
console.error('Meta:', JSON.stringify(frameMeta, null, 2))
console.error('Source round-trip OK:', frameMeta.source === code)
console.error('Elements:', elements.length)

console.log(JSON.stringify(elements, null, 2))
