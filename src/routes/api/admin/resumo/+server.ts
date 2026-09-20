/**
 * @route GET /api/admin/resumo
 * @description Contadores dos badges do menu: dias em aberto no mês e
 * justificativas aguardando aprovação.
 *
 * Existe separado do painel porque o menu aparece em TODA tela do admin, e
 * puxar o dashboard inteiro só para ler dois inteiros seria desperdício. Os
 * números saem da mesma função que alimenta o bloco "Precisa de atenção", então
 * badge e painel não podem discordar.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { carregarResumoAdmin } from '@/lib/server/painel/carregar';
import { requireAdmin, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	return jsonOk(await carregarResumoAdmin(admin.empresaId));
};
