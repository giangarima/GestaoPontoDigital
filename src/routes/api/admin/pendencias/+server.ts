/**
 * @route GET /api/admin/pendencias
 * @description Dias em aberto (marcação ímpar) da empresa do admin no período.
 *
 * `?mes=AAAA-MM` (padrão: mês corrente) ou `?inicio=&fim=` para uma janela
 * qualquer. O cálculo vem de `pendenciasDoPeriodo`, que reusa `apurarPeriodo` —
 * a lista nunca diverge do espelho.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { pendenciasDoPeriodo } from '@/lib/server/pendencias';
import { diasDoMes, diaDe, ehDia } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const inicioParam = url.searchParams.get('inicio');
	const fimParam = url.searchParams.get('fim');

	let inicio: string;
	let fim: string;
	if (inicioParam || fimParam) {
		if (!ehDia(inicioParam) || !ehDia(fimParam)) {
			return jsonError('inicio e fim devem ser datas AAAA-MM-DD', 400);
		}
		if (inicioParam > fimParam) {
			return jsonError('inicio deve ser anterior a fim', 400);
		}
		inicio = inicioParam;
		fim = fimParam;
	} else {
		const mes = url.searchParams.get('mes') ?? diaDe(new Date()).slice(0, 7);
		if (!/^\d{4}-\d{2}$/.test(mes)) {
			return jsonError('mes deve estar no formato AAAA-MM', 400);
		}
		({ inicio, fim } = diasDoMes(mes));
	}

	return jsonOk(await pendenciasDoPeriodo(admin.empresaId, inicio, fim));
};
