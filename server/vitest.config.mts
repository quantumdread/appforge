import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		include: ['test/**/*.spec.ts'],
		exclude: ['test/build-catalog.spec.ts', '**/node_modules/**'],
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: { bindings: { MCP_AUTH_TOKEN: 'test-token' } },
			},
		},
	},
});
