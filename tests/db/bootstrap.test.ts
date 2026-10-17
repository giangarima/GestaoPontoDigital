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
		await expect(bootstrapEmpresa(prisma, dados)).rejects.toThrow(/já tem/);
		// Não conta o total: outros arquivos de teste criam empresas no mesmo banco.
		expect(await prisma.empresa.count({ where: { nome: 'Loja Centro' } })).toBe(0);
		expect(await prisma.usuario.count({ where: { email: 'fulana@loja.com' } })).toBe(0);
	});
});
