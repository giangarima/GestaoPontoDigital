/** Bootstrap da produção: só roda em banco sem empresa. Validação em `bootstrap.test.ts` (unit). */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { bootstrapEmpresa, lerDadosBootstrap } from '@/lib/server/bootstrap';
import { criarEmpresa } from './fixtures';

const dados = lerDadosBootstrap({
	EMPRESA_NOME: 'Loja Centro',
	ADMIN_NOME: 'Fulana de Tal',
	ADMIN_EMAIL: 'fulana@loja.com',
	ADMIN_CPF: '529.982.247-25',
	ADMIN_SENHA: 'Segura123'
});

describe('bootstrapEmpresa', () => {
	it('recusa quando o banco já tem empresa, sem criar nada', async () => {
		await criarEmpresa();
		const antes = await prisma.empresa.count();
		await expect(bootstrapEmpresa(prisma, dados)).rejects.toThrow(/já tem/);
		expect(await prisma.empresa.count()).toBe(antes);
		expect(await prisma.usuario.count({ where: { email: 'fulana@loja.com' } })).toBe(0);
	});
});
