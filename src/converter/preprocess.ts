import { type Config, optimize } from 'svgo'

// SVGO config geared toward making the SVG easier for our walker to render:
// - drop content we can't honor (filters, animations, off-canvas paths, hidden)
// - bake group attributes / transforms onto children so each shape stands alone
// - keep shape elements as shapes (no convertShapeToPath) — our walkers expect them
const config: Config = {
	multipass: true,
	plugins: [
		'removeDoctype',
		'removeXMLProcInst',
		'removeComments',
		'removeMetadata',
		'removeEditorsNSData',
		'removeDesc',
		'removeTitle',
		'cleanupAttrs',
		'inlineStyles',
		'convertStyleToAttrs',
		'removeScripts',
		'removeStyleElement',
		'removeHiddenElems',
		'removeEmptyText',
		'removeEmptyContainers',
		'removeUselessDefs',
		'removeOffCanvasPaths',
		'convertTransform',
		'moveGroupAttrsToElems',
		'collapseGroups',
		'cleanupNumericValues',
		'cleanupIds',
	],
}

export const preprocessSvg = (svg: string): string => {
	try {
		const { data } = optimize(svg, config)
		return data
	} catch {
		// If SVGO can't parse the SVG, fall back to the original — the parser
		// will surface the real error.
		return svg
	}
}
