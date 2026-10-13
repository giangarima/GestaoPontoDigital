/**
 * @endpoint GET /api/admin/banco-horas
 * @description Banco de horas da empresa: ciclo atual de cada colaborador ativo
 * (crédito, débito, folgas, saldo, vencimento) e o resultado do ciclo anterior.
 * Sem banco configurado, responde `{ regime: 'nenhum' }`.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { carregarBancoEmpresa } from '@/lib/server/banco-horas/carregar';
import { requireAdmin, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const banco = await carregarBancoEmpresa(admin.empresaId);
	if (!banco) return jsonOk({ regime: 'nenhum' });
	return jsonOk({ regime: banco.config.regime, ...banco });
};
