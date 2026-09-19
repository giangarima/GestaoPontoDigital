/**
 * @endpoint GET /api/relatorios/espelho/pdf
 * @description Espelho de Ponto Eletrônico (Portaria 671/2021, art. 84) de um
 * colaborador da empresa do admin, em PDF. Parâmetros: `colaboradorId`,
 * `inicio` e `fim` (AAAA-MM-dd). Header `X-Assinatura`: `pades` ou `ausente`.
 * NÃO passa pelo api.ts (que só trata JSON).
 */
import type { RequestHandler } from '@sveltejs/kit';
import { ehDia } from '@/lib/server/periodo';
import { carregarEspelho, gerarEspelhoPdf } from '@/lib/server/espelho/gerar';
import { respostaPdf } from '@/lib/server/espelho/resposta';
import { requireAdmin, jsonError } from '../../../_lib/auth-helpers';

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
	if (!colaboradorId) return jsonError('colaboradorId é obrigatório', 400);
	if (!ehDia(inicio) || !ehDia(fim)) return jsonError('inicio/fim inválidos (use AAAA-MM-dd)', 400);
	if (fim < inicio) return jsonError('Data fim não pode ser anterior à data início', 400);

	const carga = await carregarEspelho(admin.empresaId, colaboradorId, inicio, fim);
	if (!carga) return jsonError('Colaborador não encontrado', 404);

	return respostaPdf(await gerarEspelhoPdf(carga.entrada));
};
