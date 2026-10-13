/**
 * @module lib/server/feriado/carregar
 * @description Carrega os feriados da empresa (nacionais + cadastrados, com a
 * escala de quem trabalha) de um período.
 */
import { prisma } from '@/lib/server/db';
import { dataPura, type Dia } from '@/lib/server/periodo';
import { juntarFeriados, type Feriados } from './calendario';

/** Feriados e pontos facultativos da empresa no período [inicio, fim]. */
export async function feriadosDoPeriodo(
	empresaId: string,
	inicio: Dia,
	fim: Dia
): Promise<Feriados> {
	const linhas = await prisma.feriado.findMany({
		where: { empresaId, data: { gte: dataPura(inicio), lte: dataPura(fim) } },
		select: {
			data: true,
			nome: true,
			tipo: true,
			abrangencia: true,
			escala: { select: { colaboradorId: true } }
		}
	});
	return juntarFeriados(
		inicio,
		fim,
		linhas.map((f) => ({ ...f, escalados: f.escala.map((e) => e.colaboradorId) }))
	);
}
