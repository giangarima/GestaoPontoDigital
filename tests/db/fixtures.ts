/**
 * Fixtures dos testes de banco. Cada teste cria a PRÓPRIA empresa (CNPJ
 * aleatório), então os NSRs começam em 1 e os testes não interferem entre si.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/server/db';
import type { Prisma } from '@/lib/server/prisma-client/client';
import { criarInclusao, criarRegistro, type NovoRegistroData } from '@/lib/server/registro-ledger';

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

/** Inclusão do tratamento (admin): fonte "I", sem NSR/hash. */
export async function incluirPonto(
	empresaId: string,
	colaboradorId: string,
	cpf: string,
	marcadoEm: Date,
	motivo = 'Colaborador esqueceu de bater'
) {
	const admin = await prisma.usuario.create({
		data: {
			empresaId,
			nome: 'Admin',
			email: `admin-${randomInt(1e9)}@teste.com`,
			cpf: digitos(11),
			senhaHash: 'x',
			role: 'admin'
		}
	});
	return prisma.$transaction((tx) =>
		criarInclusao(tx, {
			empresaId,
			colaboradorId,
			cpf,
			tipo: 'entrada',
			marcadoEm,
			criadoPor: admin.id,
			criadoMotivo: motivo
		})
	);
}

const util = {
	ativo: true,
	entrada: '08:00',
	saida_almoco: '12:00',
	retorno_almoco: '13:00',
	saida: '17:00'
};
const folga = { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' };

/** Jornada seg–sex 08:00–17:00 com almoço; sábado e domingo de folga. */
export async function vincularJornada(empresaId: string, colaboradorId: string) {
	const jornada = await prisma.jornada.create({
		data: {
			empresaId,
			nome: 'Comercial',
			versoes: {
				create: {
					vigenciaInicio: new Date('2020-01-01T00:00:00Z'),
					dias: {
						segunda: util,
						terca: util,
						quarta: util,
						quinta: util,
						sexta: util,
						sabado: folga,
						domingo: folga
					}
				}
			}
		}
	});
	await prisma.colaborador.update({
		where: { id: colaboradorId },
		data: { jornadaId: jornada.id }
	});
}

/**
 * Adultera o diário direto no banco, como faria quem tem acesso a ele, para testar
 * que a auditoria percebe. O trigger de somente inserção (migration
 * `diario_somente_insercao`) recusaria: `session_replication_role = replica`
 * desliga os triggers só dentro desta transação (o usuário do banco de teste é
 * superusuário).
 */
export function adulterar<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
	return prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
		return fn(tx);
	});
}
