/**
 * @route GET /api/admin/dashboard
 * @description Painel de um dia: quem está divergindo e o que precisa de ação.
 *
 * `?data=AAAA-MM-DD` (padrão: hoje em Brasília). As regras vivem em
 * `lib/server/painel/` — aqui só entra autenticação e validação do parâmetro.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { carregarPainelDia } from '@/lib/server/painel/carregar';
import { diaDe, ehDia } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const dataParam = url.searchParams.get('data');
	if (dataParam !== null && !ehDia(dataParam)) {
		return jsonError('data deve estar no formato AAAA-MM-DD', 400);
	}
	const dia = dataParam ?? diaDe(new Date());

	return jsonOk(await carregarPainelDia(admin.empresaId, dia));
};
