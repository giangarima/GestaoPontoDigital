/**
 * Prepara o banco de teste uma vez por execução: zera o schema e aplica TODAS as
 * migrations do zero com `migrate deploy` (o mesmo comando do deploy). Assim a
 * própria cadeia de migrations é testada a cada rodada.
 */
import { execSync } from 'node:child_process';
import pg from 'pg';
import { assertBancoLocal } from './guard';

export default async function setup() {
	const url =
		process.env.TEST_DATABASE_URL ?? 'postgresql://ponto:ponto@localhost:55432/ponto_test';
	assertBancoLocal(url);

	const client = new pg.Client({ connectionString: url });
	try {
		await client.connect();
	} catch {
		throw new Error(
			`Banco de teste inacessível (${url}). Suba com: docker compose --profile test up -d postgres-test`
		);
	}
	await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
	await client.end();

	execSync('npx prisma migrate deploy', {
		env: { ...process.env, DATABASE_URL: url },
		stdio: 'pipe'
	});
}
