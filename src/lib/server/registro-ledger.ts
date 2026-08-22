/**
 * @module lib/server/registro-ledger
 * @description Cadeia de integridade (hash-chain) + NSR sequencial das batidas.
 *
 * Portaria 671/2021 (REP-P): o AFD exige NSR (Número Sequencial de Registro)
 * unitário por estabelecimento e integridade verificável dos registros. Aqui o
 * estabelecimento é a empresa (`empresaId`). Cada batida recebe:
 *  - `nsr`: contador por empresa, iniciando em 1, na ordem de inserção;
 *  - `hash`: SHA-256 do conteúdo canônico encadeado ao hash da batida anterior.
 *
 * Alterar uma batida antiga direto no banco quebra a cadeia — `verificarCadeia`
 * detecta, elevando a imutabilidade de convenção para garantia técnica.
 *
 * A serialização canônica vive em `registro-hash.ts` (puro, compartilhado com o seed).
 */
import { prisma } from '@/lib/server/db';
import { GENESIS_HASH, hashRegistro } from '@/lib/server/registro-hash';
import type { Prisma, Registro } from '@/lib/server/prisma-client/client';

/** Dados de uma nova batida (os campos de cadeia são calculados aqui). */
export interface NovoRegistroData {
	colaboradorId: string;
	empresaId: string;
	tipo: string;
	metodo: string;
	marcadoEm?: Date;
	criadoPor?: string | null;
	criadoMotivo?: string | null;
}

/**
 * Cria uma batida atribuindo NSR e hash-chain de forma atômica. DEVE rodar dentro
 * de uma transação: um advisory lock por empresa serializa a atribuição de NSR
 * até o commit, evitando buracos/colisões sob concorrência (o `@@unique
 * [empresaId, nsr]` é a rede de segurança).
 */
export async function criarRegistro(
	tx: Prisma.TransactionClient,
	data: NovoRegistroData
): Promise<Registro> {
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'registro_nsr:' + data.empresaId}))`;

	const head = await tx.registro.findFirst({
		where: { empresaId: data.empresaId },
		orderBy: { nsr: 'desc' },
		select: { nsr: true, hash: true }
	});

	const nsr = (head?.nsr ?? 0n) + 1n;
	const hashAnterior = head?.hash ?? GENESIS_HASH;
	const marcadoEm = data.marcadoEm ?? new Date();

	const hash = hashRegistro(
		{
			empresaId: data.empresaId,
			colaboradorId: data.colaboradorId,
			nsr,
			tipo: data.tipo,
			marcadoEm,
			metodo: data.metodo,
			criadoPor: data.criadoPor,
			criadoMotivo: data.criadoMotivo
		},
		hashAnterior
	);

	return tx.registro.create({
		data: {
			colaboradorId: data.colaboradorId,
			empresaId: data.empresaId,
			tipo: data.tipo,
			metodo: data.metodo,
			marcadoEm,
			criadoPor: data.criadoPor ?? undefined,
			criadoMotivo: data.criadoMotivo ?? undefined,
			nsr,
			hash,
			hashAnterior
		}
	});
}

/** Resultado da auditoria da cadeia de uma empresa. */
export interface CadeiaResultado {
	total: number;
	valida: boolean;
	/** Primeiro NSR onde a cadeia quebrou (null se íntegra). */
	quebraNsr: string | null;
	motivo: string | null;
}

/**
 * Percorre as batidas por NSR crescente e recomputa a cadeia, retornando o
 * primeiro ponto de quebra (sequência de NSR, elo ou conteúdo adulterado).
 */
export async function verificarCadeia(empresaId: string): Promise<CadeiaResultado> {
	const registros = await prisma.registro.findMany({
		where: { empresaId },
		orderBy: { nsr: 'asc' },
		select: {
			nsr: true,
			colaboradorId: true,
			tipo: true,
			marcadoEm: true,
			metodo: true,
			criadoPor: true,
			criadoMotivo: true,
			hash: true,
			hashAnterior: true
		}
	});

	let anterior = GENESIS_HASH;
	let esperadoNsr = 1n;
	for (const r of registros) {
		const quebra = (motivo: string): CadeiaResultado => ({
			total: registros.length,
			valida: false,
			quebraNsr: r.nsr.toString(),
			motivo
		});

		if (r.nsr !== esperadoNsr) return quebra(`NSR fora de sequência (esperado ${esperadoNsr})`);
		if ((r.hashAnterior ?? GENESIS_HASH) !== anterior)
			return quebra('hashAnterior não corresponde');

		const recalc = hashRegistro(
			{
				empresaId,
				colaboradorId: r.colaboradorId,
				nsr: r.nsr,
				tipo: r.tipo,
				marcadoEm: r.marcadoEm,
				metodo: r.metodo,
				criadoPor: r.criadoPor,
				criadoMotivo: r.criadoMotivo
			},
			anterior
		);
		if (recalc !== r.hash) return quebra('hash não corresponde (conteúdo alterado)');

		anterior = r.hash;
		esperadoNsr += 1n;
	}

	return { total: registros.length, valida: true, quebraNsr: null, motivo: null };
}
