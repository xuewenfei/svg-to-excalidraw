import { defineConfig, type UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
	entry: ['./src/index.ts'],
	format: ['esm'],
	dts: true,
	outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})

export default config
