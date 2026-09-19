/** Roda em cada arquivo de teste de banco, antes de qualquer import do Prisma. */
import { afterAll } from 'vitest';
import { assertBancoLocal } from './guard';

assertBancoLocal(process.env.DATABASE_URL);

afterAll(async () => {
	const { prisma } = await import('@/lib/server/db');
	await prisma.$disconnect();
});
