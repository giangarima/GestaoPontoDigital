/**
 * @endpoint GET /api/admin/colaboradores/:id/perfil?periodo=30d|3m|6m|12m
 * @description Perfil do colaborador no período (padrão 3m, até ontem) e o resumo
 * do período anterior de mesmo tamanho: pontualidade, assiduidade, horas, banco e
 * local da batida, com a tendência e os padrões. Ver `src/lib/server/perfil/`.
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

	const periodo = (url.searchParams.get('periodo') ?? '3m') as PeriodoPerfil;
	if (!PERIODOS_PERFIL.includes(periodo)) {
		return jsonError(`periodo deve ser ${PERIODOS_PERFIL.join(', ')}`, 400);
	}

	const perfil = await carregarPerfil(admin.empresaId, params.id!, periodo);
	if (!perfil) return jsonError('Colaborador não encontrado', 404);
	return jsonOk(perfil);
};
