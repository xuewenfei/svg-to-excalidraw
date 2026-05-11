// Augment Playwright's modern matcher types with playwright-odiff's matcher.
// The shipped types target the legacy `PlaywrightTest.Matchers` namespace which
// modern @playwright/test no longer uses, so the matcher isn't visible on
// `expect(...)` chains without this declaration.

import type { Locator, Page } from '@playwright/test'
import type { OdiffScreenshotOptions } from 'playwright-odiff'

type OdiffMatcher<R> = {
	(name?: string | string[], options?: OdiffScreenshotOptions): Promise<R>
	(options?: { name?: string | string[] } & OdiffScreenshotOptions): Promise<R>
}

declare module '@playwright/test' {
	interface Matchers<R, T> {
		toHaveScreenshotOdiff: T extends Page | Locator ? OdiffMatcher<R> : never
	}
}
