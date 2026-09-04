import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/ui',
	use: {
		baseURL: 'http://127.0.0.1:4173',
		viewport: { width: 1280, height: 860 },
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
