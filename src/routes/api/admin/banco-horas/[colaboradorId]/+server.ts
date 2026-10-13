/**
 * @endpoint GET /api/admin/banco-horas/:colaboradorId?ciclo=AAAA-MM-dd
 * @description Extrato do banco de horas de um colaborador num ciclo (o que
 * começa na data `ciclo`; padrão: o atual), com os movimentos dia a dia.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { carregarExtratoBanco, configDoBanco } from '@/lib/server/banco-horas/carregar';
import { ehDia } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, params, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const ciclo = url.searchParams.get('ciclo') ?? undefined;
	if (ciclo !== undefined && !ehDia(ciclo)) return jsonError('ciclo deve ser AAAA-MM-dd', 400);

	if (!(await configDoBanco(admin.empresaId))) return jsonOk({ regime: 'nenhum' });
	const extrato = await carregarExtratoBanco(
		admin.empresaId,
		params.colaboradorId!,
		new Date(),
		ciclo
	);
	if (!extrato) return jsonError('Colaborador não encontrado', 404);
	return jsonOk({ regime: extrato.config.regime, ...extrato });
};
