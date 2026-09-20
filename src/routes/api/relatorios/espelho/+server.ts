import type { RequestHandler } from '@sveltejs/kit';
import { buildDailySummaries, ausenciaDateKeys } from '@/lib/server/timesheet';
import { contratualPorDia, previstasPorDia } from '@/lib/server/jornada';
import { ehDia } from '@/lib/server/periodo';
import { carregarEspelho } from '@/lib/server/espelho/gerar';
import { montarEspelho, type TotaisEspelho } from '@/lib/server/espelho/montar';
import { requireAdmin, jsonError, jsonOk } from '../../_lib/auth-helpers';

const horas = (min: number) => Number((min / 60).toFixed(2));

/** Totais no formato da API (horas decimais). */
function totaisDTO(t: TotaisEspelho) {
	return { horas: horas(t.realizadoMin), extras: horas(t.extraMin), deficit: horas(t.deficitMin) };
}

export const GET: RequestHandler = async ({ request, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const colaboradorId = url.searchParams.get('colaboradorId');
	const inicio = url.searchParams.get('inicio');
	const fim = url.searchParams.get('fim');

	if (!colaboradorId || !inicio || !fim) {
		return jsonError('colaboradorId, inicio e fim são obrigatórios', 400);
	}
	if (!ehDia(inicio) || !ehDia(fim)) {
		return jsonError('Datas inválidas', 400);
	}

	const carga = await carregarEspelho(admin.empresaId, colaboradorId, inicio, fim);
	if (!carga) {
		return jsonError('Colaborador não encontrado', 404);
	}
	const { colaborador, registros, entrada } = carga;

	// Estado efetivo (com o tratamento do admin) e estado original (só as
	// marcações do REP, fonte "O") — ambos a partir dos mesmos registros.
	const opcoes = {
		datasAbonadas: ausenciaDateKeys(entrada.ausencias),
		contratualMin: contratualPorDia(entrada.versoes),
		previstas: previstasPorDia(entrada.versoes)
	};
	const diasEfetivos = buildDailySummaries(registros, opcoes);
	const diasOriginais = buildDailySummaries(registros, {
		...opcoes,
		isValida: (p) => p.fonte === 'O'
	});
	const origPorData = new Map(diasOriginais.map((d) => [d.date, d]));

	const dias = diasEfetivos.map((d) => {
		const o = origPorData.get(d.date);
		return {
			...d,
			original: {
				totalHours: o?.totalHours ?? 0,
				overtime: o?.overtime ?? 0,
				deficit: o?.deficit ?? 0
			}
		};
	});

	// Totais pelo mesmo cálculo do espelho em PDF (incluem as faltas do período).
	return jsonOk({
		colaborador: { id: colaborador.id, nome: colaborador.usuario.nome },
		inicio,
		fim,
		dias,
		totais: {
			...totaisDTO(montarEspelho(entrada).totais),
			original: totaisDTO(montarEspelho(entrada, { visao: 'original' }).totais)
		}
	});
};
