/**
 * Fixtures dos testes de banco. Cada teste cria a PRÓPRIA empresa (CNPJ
 * aleatório), então os NSRs começam em 1 e os testes não interferem entre si.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/server/db';
import { criarRegistro, type NovoRegistroData } from '@/lib/server/registro-ledger';

function digitos(n: number): string {
	return Array.from({ length: n }, () => randomInt(10)).join('');
}

export async function criarEmpresa() {
	return prisma.empresa.create({
		data: {
			nome: 'Empresa Teste',
			razaoSocial: 'Empresa Teste Ltda',
			cnpj: digitos(14),
			horaAbertura: '08:00',
			horaFechamento: '18:00'
		}
	});
}

export async function criarColaborador(empresaId: string, nome = 'Fulano de Tal') {
	const cpf = digitos(11);
	const usuario = await prisma.usuario.create({
		data: {
			empresaId,
			nome,
			email: `${cpf}@teste.com`,
			cpf,
			senhaHash: 'x',
			role: 'colaborador',
			colaborador: { create: { empresaId } }
		},
		include: { colaborador: true }
	});
	return { usuario, colaborador: usuario.colaborador! };
}

/** Uma batida pelo caminho real (transação + NSR + hash-chain). */
export function baterPonto(
	empresaId: string,
	colaboradorId: string,
	cpf: string,
	extra: Partial<NovoRegistroData> = {}
) {
	return prisma.$transaction((tx) =>
		criarRegistro(tx, {
			empresaId,
			colaboradorId,
			cpf,
			tipo: 'entrada',
			metodo: 'manual',
			...extra
		})
	);
}
