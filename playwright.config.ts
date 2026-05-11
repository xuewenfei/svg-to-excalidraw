import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: './tests/visual',
	testMatch: /.*\.playwright\.ts$/,
	fullyParallel: false,
	reporter: 'list',
	use: {
		viewport: { width: 800, height: 600 },
		deviceScaleFactor: 1,
	},
	projects: [
		{
			name: 'chromium',
			use: { browserName: 'chromium' },
		},
	],
})
