import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// version: '1.90.0',
	mocha: {
		ui: 'tdd',
		timeout: 250000,
		retries: 3,
		color: true,
	},
});