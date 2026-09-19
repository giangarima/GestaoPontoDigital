import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Banco dos testes de integração: Postgres descartável do docker-compose
 * (serviço `postgres-test`, profile "test", porta 55432, dados em tmpfs).
 * NUNCA o DATABASE_URL do .env — ele aponta para o Neon de produção.
 */
const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ?? 'postgresql://ponto:ponto@localhost:55432/ponto_test';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			'@': path.resolve('./src')
		}
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['src/**/*.test.ts'],
					environment: 'node'
				}
			},
			{
				extends: true,
				test: {
					name: 'db',
					include: ['tests/db/**/*.test.ts'],
					environment: 'node',
					env: { DATABASE_URL: TEST_DATABASE_URL },
					globalSetup: ['tests/db/global-setup.ts'],
					setupFiles: ['tests/db/setup.ts'],
					// Todos os arquivos compartilham o mesmo banco: roda um por vez.
					fileParallelism: false,
					testTimeout: 30_000,
					hookTimeout: 60_000
				}
			}
		]
	}
});
