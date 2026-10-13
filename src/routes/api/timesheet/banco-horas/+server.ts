/**
 * @endpoint GET /api/timesheet/banco-horas
 * @description Saldo do banco de horas do próprio colaborador no ciclo atual,
 * com o extrato. Sem banco na empresa (ou sem vínculo), `{ regime: 'nenhum' }`.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { carregarExtratoBanco } from '@/lib/server/banco-horas/carregar';
import { requireUser, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request }) => {
	let user;
	try {
		user = requireUser(request);
	} catch (response) {
		return response as Response;
	}
	if (!user.colaboradorId) return jsonOk({ regime: 'nenhum' });

	const extrato = await carregarExtratoBanco(user.empresaId, user.colaboradorId);
	if (!extrato) return jsonOk({ regime: 'nenhum' });
	return jsonOk({ regime: extrato.config.regime, ...extrato });
};
