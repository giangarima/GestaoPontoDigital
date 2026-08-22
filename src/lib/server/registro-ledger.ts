/**
 * @module lib/server/registro-ledger
 * @description Cadeia unificada de NSR do REP (Portaria 671/2021) + hash-chain das
 * batidas. Todo evento do AFD — empregador (tipo 2), empregado (tipo 5) e marcação
 * (tipo 7) — recebe um NSR único por empresa, alocado atomicamente pelo contador
 * `Empresa.ultimoNsr`. O `UPDATE ... RETURNING` trava a linha da empresa até o
 * commit, serializando a alocação e a leitura do elo anterior (sem forks).
 *
 * O encadeamento SHA-256 é só das batidas (tipo 7): `hashAnterior` aponta para o
 * hash da batida de maior NSR anterior. A serialização/hash vive em `registro-hash.ts`.
 */
import { prisma } from '@/lib/server/db';
import { hashRegistro } from '@/lib/server/registro-hash';
import type { Prisma, Registro } from '@/lib/server/prisma-client/client';

/** Aloca o próximo NSR da empresa de forma atômica (serializa por row lock). */
export async function proximoNsr(tx: Prisma.TransactionClient, empresaId: string): Promise<bigint> {
	const rows = await tx.$queryRaw<{ ultimo_nsr: bigint }[]>`
		UPDATE empresas SET ultimo_nsr = ultimo_nsr + 1 WHERE id = ${empresaId} RETURNING ultimo_nsr`;
	if (rows.length === 0) throw new Error(`Empresa ${empresaId} não encontrada ao alocar NSR`);
	return rows[0].ultimo_nsr;
}

/** Dados de uma nova batida (NSR, hash e data de gravação são calculados aqui). */
export interface NovoRegistroData {
	colaboradorId: string;
	empresaId: string;
	cpf: string; // CPF de quem bateu (snapshot congelado na batida)
	tipo: string;
	metodo: string;
	marcadoEm?: Date;
	criadoPor?: string | null;
	criadoMotivo?: string | null;
}

/**
 * Cria uma batida (AFD tipo 7) atribuindo NSR e hash-chain. DEVE rodar dentro de
 * uma transação. `registradoEm` = agora (DH de gravação); `marcadoEm` pode ser
 * retroativo (lançamento manual). O hash gravado é o campo 8 do registro tipo 7.
 */
export async function criarRegistro(
	tx: Prisma.TransactionClient,
	data: NovoRegistroData
): Promise<Registro> {
	const nsr = await proximoNsr(tx, data.empresaId);

	// Elo anterior = hash da batida de maior NSR existente (eventos tipo 2/5 não
	// entram na cadeia de hash). null no primeiro elo.
	const ultima = await tx.registro.findFirst({
		where: { empresaId: data.empresaId },
		orderBy: { nsr: 'desc' },
		select: { hash: true }
	});
	const hashAnterior = ultima?.hash ?? null;

	const marcadoEm = data.marcadoEm ?? new Date();
	const registradoEm = new Date();
	const hash = hashRegistro({ nsr, marcadoEm, cpf: data.cpf, registradoEm }, hashAnterior);

	return tx.registro.create({
		data: {
			colaboradorId: data.colaboradorId,
			empresaId: data.empresaId,
			cpf: data.cpf,
			tipo: data.tipo,
			metodo: data.metodo,
			marcadoEm,
			registradoEm,
			criadoPor: data.criadoPor ?? undefined,
			criadoMotivo: data.criadoMotivo ?? undefined,
			nsr,
			hash,
			hashAnterior
		}
	});
}

/** Evento de empregador (AFD tipo 2). */
export interface NovoEventoEmpregador {
	empresaId: string;
	cpfResponsavel: string;
	inscricaoTipo: string; // "1" CNPJ | "2" CPF
	inscricao: string; // só dígitos
	caepfCno?: string | null;
	razaoSocial: string;
	localPrestacao?: string | null;
}

export async function registrarEventoEmpregador(
	tx: Prisma.TransactionClient,
	data: NovoEventoEmpregador
) {
	const nsr = await proximoNsr(tx, data.empresaId);
	return tx.eventoEmpregador.create({
		data: {
			empresaId: data.empresaId,
			nsr,
			cpfResponsavel: data.cpfResponsavel,
			inscricaoTipo: data.inscricaoTipo,
			inscricao: data.inscricao,
			caepfCno: data.caepfCno ?? undefined,
			razaoSocial: data.razaoSocial,
			localPrestacao: data.localPrestacao ?? undefined
		}
	});
}

/** Evento de empregado (AFD tipo 5). */
export interface NovoEventoEmpregado {
	empresaId: string;
	operacao: 'I' | 'A' | 'E';
	cpfEmpregado: string;
	nomeEmpregado: string;
	cpfResponsavel: string;
	colaboradorId?: string | null;
}

export async function registrarEventoEmpregado(
	tx: Prisma.TransactionClient,
	data: NovoEventoEmpregado
) {
	const nsr = await proximoNsr(tx, data.empresaId);
	return tx.eventoEmpregado.create({
		data: {
			empresaId: data.empresaId,
			nsr,
			operacao: data.operacao,
			cpfEmpregado: data.cpfEmpregado,
			nomeEmpregado: data.nomeEmpregado,
			cpfResponsavel: data.cpfResponsavel,
			colaboradorId: data.colaboradorId ?? undefined
		}
	});
}

/** Resultado da auditoria da cadeia de batidas de uma empresa. */
export interface CadeiaResultado {
	total: number;
	valida: boolean;
	/** NSR da batida onde a cadeia quebrou (null se íntegra). */
	quebraNsr: string | null;
	motivo: string | null;
}

/**
 * Percorre as batidas por NSR crescente e recomputa o hash tipo 7, retornando o
 * primeiro ponto de quebra (elo ou conteúdo adulterado).
 */
export async function verificarCadeia(empresaId: string): Promise<CadeiaResultado> {
	const registros = await prisma.registro.findMany({
		where: { empresaId },
		orderBy: { nsr: 'asc' },
		select: {
			nsr: true,
			marcadoEm: true,
			cpf: true,
			registradoEm: true,
			hash: true,
			hashAnterior: true
		}
	});

	let anterior: string | null = null;
	for (const r of registros) {
		const quebra = (motivo: string): CadeiaResultado => ({
			total: registros.length,
			valida: false,
			quebraNsr: r.nsr.toString(),
			motivo
		});

		if ((r.hashAnterior ?? null) !== anterior) return quebra('hashAnterior não corresponde');

		const recalc = hashRegistro(
			{ nsr: r.nsr, marcadoEm: r.marcadoEm, cpf: r.cpf, registradoEm: r.registradoEm },
			anterior
		);
		if (recalc !== r.hash) return quebra('hash não corresponde (conteúdo alterado)');

		anterior = r.hash;
	}

	return { total: registros.length, valida: true, quebraNsr: null, motivo: null };
}
