/**
 * @endpoint GET /api/relatorios/aej
 * @description Gera e baixa o AEJ (Arquivo Eletrônico de Jornada) da empresa do
 * admin autenticado. Parâmetros obrigatórios: `inicio` e `fim` (YYYY-MM-DD).
 *
 * Retorna texto (ISO-8859-1) como anexo — NÃO passa pelo api.ts (que só trata JSON).
 */
import type { RequestHandler } from '@sveltejs/kit';
import { gerarAej } from '@/lib/server/aej/gerar';
import { requireAdmin, jsonError } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const inicioParam = url.searchParams.get('inicio');
	const fimParam = url.searchParams.get('fim');

	if (!inicioParam || !fimParam) {
		return jsonError('Parâmetros inicio e fim são obrigatórios (use YYYY-MM-DD)', 400);
	}

	const inicio = new Date(`${inicioParam}T00:00:00.000Z`);
	const fim = new Date(`${fimParam}T23:59:59.999Z`);

	if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
		return jsonError('inicio/fim inválidos (use YYYY-MM-DD)', 400);
	}

	if (fim < inicio) {
		return jsonError('Data fim não pode ser anterior à data início', 400);
	}

	const { conteudo, nome } = await gerarAej(admin.empresaId, { inicio, fim });

	return new Response(conteudo as unknown as BodyInit, {
		status: 200,
		headers: {
			'Content-Type': 'text/plain; charset=iso-8859-1',
			'Content-Disposition': `attachment; filename="${nome}"`
		}
	});
};
