/**
 * @endpoint GET /api/admin/hora-legal
 * @description Diagnóstico: diferença entre o relógio do servidor (REP-P) e a
 * Hora Legal Brasileira, medida por SNTP nos servidores do NTP.br. Mostra
 * também se a hospedagem permite a consulta (UDP 123) — `falhas` traz o erro
 * de cada servidor tentado.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { medirHoraLegal } from '@/lib/server/hora-legal';
import { requireAdmin, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request }) => {
	try {
		requireAdmin(request);
	} catch (response) {
		return response as Response;
	}
	return jsonOk(await medirHoraLegal());
};
