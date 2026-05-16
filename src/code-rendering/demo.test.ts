// --- test ---
import './browser-shim.ts'
import { codeToExcalidraw } from './code-to-excalidraw.ts'

const code = `interface StreamCardView{
  title: Slot
  body: Slot
  status: string | null
}`

const result = await codeToExcalidraw(code, 'typescript')

// Verify metadata round-trip
const rectMeta = result.elements[0].customData
console.error('Meta:', JSON.stringify(rectMeta, null, 2))
console.error('Source round-trip OK:', rectMeta.source === code)
console.error('Elements:', result.elements.length)

console.log(JSON.stringify(result, null, 2))
