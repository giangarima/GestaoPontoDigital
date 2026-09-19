/**
 * @module lib/server/disponibilidade
 * @description Eventos de disponibilidade do REP-P no AFD (registro tipo 6,
 * leiaute oficial do gov.br): "07" quando o servidor passa a atender e "08"
 * quando deixa de atender. Registrado para cada empresa, com NSR próprio.
 *
 * - Início do servidor (`init` em hooks.server.ts) → "07".
 * - Desligamento ordenado (SIGTERM/SIGINT → `sveltekit:shutdown`) → "08".
 * - Queda sem aviso (crash, SIGKILL): o "08" não chega a ser gravado. No
 *   início seguinte, se o último evento da empresa é "07", grava-se o "08"
 *   antes do novo "07". O campo do AFD é a data e hora da GRAVAÇÃO, então o
 *   "08" tardio é fiel: registra quando a indisponibilidade foi constatada.
 */
import { prisma } from '@/lib/server/db';
import { registrarEventoSensivel, type TipoEventoSensivel } from '@/lib/server/registro-ledger';
import type { Prisma } from '@/lib/server/prisma-client/client';

export const DISPONIVEL: TipoEventoSensivel = '07';
export const INDISPONIVEL: TipoEventoSensivel = '08';

/** Último evento de disponibilidade da empresa, com a linha da empresa travada. */
async function ultimoEvento(tx: Prisma.TransactionClient, empresaId: string) {
	await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
	return tx.eventoSensivel.findFirst({
		where: { empresaId, tipoEvento: { in: [DISPONIVEL, INDISPONIVEL] } },
		orderBy: { nsr: 'desc' },
		select: { tipoEvento: true }
	});
}

/** Servidor começou a atender: "08" pendente (queda sem aviso), se houver, e "07". */
export async function registrarDisponibilidade(empresaId: string): Promise<TipoEventoSensivel[]> {
	return prisma.$transaction(async (tx) => {
		const gravados: TipoEventoSensivel[] = [];
		const ultimo = await ultimoEvento(tx, empresaId);
		if (ultimo?.tipoEvento === DISPONIVEL) {
			await registrarEventoSensivel(tx, { empresaId, tipoEvento: INDISPONIVEL });
			gravados.push(INDISPONIVEL);
		}
		await registrarEventoSensivel(tx, { empresaId, tipoEvento: DISPONIVEL });
		gravados.push(DISPONIVEL);
		return gravados;
	});
}

/** Servidor vai parar de atender: "08", se a empresa estiver marcada como disponível. */
export async function registrarIndisponibilidade(empresaId: string): Promise<boolean> {
	return prisma.$transaction(async (tx) => {
		const ultimo = await ultimoEvento(tx, empresaId);
		if (ultimo?.tipoEvento !== DISPONIVEL) return false;
		await registrarEventoSensivel(tx, { empresaId, tipoEvento: INDISPONIVEL });
		return true;
	});
}

/**
 * Aplica `registrar` a todas as empresas (ou só às de `ids`); falha de uma não
 * impede as outras.
 */
async function paraCadaEmpresa(
	acao: string,
	registrar: (empresaId: string) => Promise<unknown>,
	ids?: string[]
): Promise<void> {
	const empresas = await prisma.empresa.findMany({
		where: ids ? { id: { in: ids } } : {},
		select: { id: true }
	});
	const resultados = await Promise.allSettled(empresas.map((e) => registrar(e.id)));
	resultados.forEach((r, i) => {
		if (r.status === 'rejected') {
			console.error(`[rep] falha ao registrar ${acao} (empresa ${empresas[i].id})`, r.reason);
		}
	});
}

/** Início do servidor: "07" (e "08" pendente) para todas as empresas. */
export function registrarInicioDoServidor(ids?: string[]): Promise<void> {
	return paraCadaEmpresa('disponibilidade (07)', registrarDisponibilidade, ids);
}

/** Desligamento ordenado: "08" para todas as empresas. */
export function registrarParadaDoServidor(ids?: string[]): Promise<void> {
	return paraCadaEmpresa('indisponibilidade (08)', registrarIndisponibilidade, ids);
}
