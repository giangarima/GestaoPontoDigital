/**
 * @endpoint GET /api/admin/colaboradores/:id/perfil?periodo=30d|3m|6m|12m
 * @description Perfil do colaborador: o dia (hoje ou o último com expediente), a
 * semana dele e os quatro cards do período (padrão 30d, até ontem) — presença,
 * pontualidade, onde atrasa e saldo de horas. Ver `src/lib/server/perfil/`.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { carregarPerfil } from '@/lib/server/perfil/carregar';
import { PERIODOS_PERFIL, type PeriodoPerfil } from '@/lib/server/perfil/montar';
import { requireAdmin, jsonError, jsonOk } from '../../../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, params, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const periodo = (url.searchParams.get('periodo') ?? '30d') as PeriodoPerfil;
	if (!PERIODOS_PERFIL.includes(periodo)) {
		return jsonError(`periodo deve ser ${PERIODOS_PERFIL.join(', ')}`, 400);
	}

	const perfil = await carregarPerfil(admin.empresaId, params.id!, periodo);
	if (!perfil) return jsonError('Colaborador não encontrado', 404);
	return jsonOk(perfil);
};
