/**
 * @endpoint GET /api/timesheet/espelho
 * @description Espelho de Ponto Eletrônico do PRÓPRIO colaborador, em PDF, de um
 * mês (`mes=AAAA-MM`). A Portaria 671/2021 (art. 84, parágrafo único) exige que
 * o trabalhador tenha acesso ao espelho ao menos mensalmente pelo sistema.
 * Header `X-Assinatura`: `pades` ou `ausente`. NÃO passa pelo api.ts.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { diasDoMes } from '@/lib/server/periodo';
import { carregarEspelho, gerarEspelhoPdf } from '@/lib/server/espelho/gerar';
import { respostaPdf } from '@/lib/server/espelho/resposta';
import { requireUser, jsonError } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, url }) => {
	let user;
	try {
		user = requireUser(request);
	} catch (response) {
		return response as Response;
	}
	if (!user.colaboradorId) return jsonError('Usuário sem vínculo de colaborador', 403);

	const mes = url.searchParams.get('mes');
	if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
		return jsonError('mes é obrigatório no formato AAAA-MM', 400);
	}
	const { inicio, fim } = diasDoMes(mes);

	const carga = await carregarEspelho(user.empresaId, user.colaboradorId, inicio, fim);
	if (!carga) return jsonError('Colaborador não encontrado', 404);

	return respostaPdf(await gerarEspelhoPdf(carga.entrada));
};
