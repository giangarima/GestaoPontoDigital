/**
 * @endpoint GET /api/relatorios/aej
 * @description Gera e baixa o AEJ (Arquivo Eletrônico de Jornada) da empresa do
 * admin autenticado. Parâmetros obrigatórios: `inicio` e `fim` (YYYY-MM-DD).
 *
 * Retorna um .zip com o AEJ (.txt, ISO-8859-1) e a assinatura CAdES destacada
 * (.p7s). Sem certificado configurado, só o .txt (header `X-Assinatura: ausente`).
 * NÃO passa pelo api.ts (que só trata JSON).
 */
import type { RequestHandler } from '@sveltejs/kit';
import { gerarAej } from '@/lib/server/aej/gerar';
import { carregarCredencial } from '@/lib/server/assinatura/certificado';
import { empacotarAssinado, respostaDownload } from '@/lib/server/assinatura/pacote';
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

	// Dias inteiros no fuso de Brasília (o mesmo -0300 gravado nos campos do arquivo).
	const inicio = new Date(`${inicioParam}T00:00:00.000-03:00`);
	const fim = new Date(`${fimParam}T23:59:59.999-03:00`);

	if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
		return jsonError('inicio/fim inválidos (use YYYY-MM-DD)', 400);
	}

	if (fim < inicio) {
		return jsonError('Data fim não pode ser anterior à data início', 400);
	}

	const { conteudo, nome } = await gerarAej(admin.empresaId, { inicio, fim });

	return respostaDownload(empacotarAssinado(nome, conteudo, carregarCredencial()));
};
