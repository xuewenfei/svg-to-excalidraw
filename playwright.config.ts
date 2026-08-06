import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = defineConfig({
	testDir: './tests/visual',
	testMatch: /.*\.spec\.ts$/,
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

export default config
