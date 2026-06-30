import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.e2e.ts',
	timeout: 30000,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: "BOARD_FILE=/tmp/e2e-board.json BOARD_CONFIG_FILE=/tmp/e2e-config.json bun run dev",
		port: 5173,
		timeout: 60000,
		reuseExistingServer: true
	}
});
