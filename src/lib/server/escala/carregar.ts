/**
 * @module lib/server/escala/carregar
 * @description Carrega a escala de folga (ciclos + ajustes) dos colaboradores.
 */
import { prisma } from '@/lib/server/db';
import { dataPura, diaDaDataPura, type Dia } from '@/lib/server/periodo';
import type { EscalaColaborador } from './calendario';

/**
 * Escala de cada colaborador: todos os ciclos (são poucos e o vigente pode ter
 * começado antes do período) e os ajustes do período [inicio, fim]. Quem não tem
 * nem ciclo nem ajuste fica de fora do mapa — vale o padrão semanal da jornada.
 */
export async function escalasDosColaboradores(
	colaboradorIds: string[],
	inicio: Dia,
	fim: Dia
): Promise<Map<string, EscalaColaborador>> {
	const [ciclos, ajustes] = await Promise.all([
		prisma.escalaCiclo.findMany({
			where: { colaboradorId: { in: colaboradorIds } },
			select: { colaboradorId: true, vigenciaInicio: true, sequencia: true }
		}),
		prisma.escalaAjuste.findMany({
			where: {
				colaboradorId: { in: colaboradorIds },
				data: { gte: dataPura(inicio), lte: dataPura(fim) }
			},
			select: { colaboradorId: true, data: true, trabalha: true }
		})
	]);

	const escalas = new Map<
		string,
		{ ciclos: EscalaColaborador['ciclos']; ajustes: Map<Dia, boolean> }
	>();
	const da = (id: string) => {
		let e = escalas.get(id);
		if (!e) escalas.set(id, (e = { ciclos: [], ajustes: new Map() }));
		return e;
	};
	for (const c of ciclos) da(c.colaboradorId).ciclos.push(c);
	for (const a of ajustes) da(a.colaboradorId).ajustes.set(diaDaDataPura(a.data), a.trabalha);
	return escalas;
}

/** Escala de um colaborador no período (`null` = padrão semanal da jornada). */
export async function escalaDoColaborador(
	colaboradorId: string,
	inicio: Dia,
	fim: Dia
): Promise<EscalaColaborador | null> {
	return (await escalasDosColaboradores([colaboradorId], inicio, fim)).get(colaboradorId) ?? null;
}
