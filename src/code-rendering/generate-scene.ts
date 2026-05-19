import type { BundledLanguage } from 'shiki'
import { codeToExcalidraw } from './code-to-excalidraw.ts'

const [, , code, lang] = process.argv
if (!code || !lang) {
	process.stderr.write('Usage: generate-scene.ts <code> <lang>\n')
	process.exit(1)
}

const scene = await codeToExcalidraw(code, lang as BundledLanguage)
process.stdout.write(JSON.stringify(scene))