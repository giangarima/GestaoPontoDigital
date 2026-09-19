/**
 * @endpoint GET /api/relatorios/afd
 * @description Gera e baixa o AFD (Arquivo Fonte de Dados, Portaria 671/2021) da
 * empresa do admin autenticado. Query opcional `inicio`/`fim` (YYYY-MM-DD) filtra
 * as marcações; eventos de empregador/empregado entram sempre (contexto do arquivo).
 *
 * Retorna um .zip com o AFD (.txt, ISO-8859-1) e a assinatura CAdES destacada
 * (.p7s). Sem certificado configurado, só o .txt (header `X-Assinatura: ausente`).
 * NÃO passa pelo api.ts (que só trata JSON).
 */
import type { RequestHandler } from '@sveltejs/kit';
import { gerarAfd } from '@/lib/server/afd/gerar';
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
	// Dias inteiros no fuso de Brasília (o mesmo -0300 gravado nos campos do arquivo).
	const inicio = inicioParam ? new Date(`${inicioParam}T00:00:00.000-03:00`) : undefined;
	const fim = fimParam ? new Date(`${fimParam}T23:59:59.999-03:00`) : undefined;
	if ((inicio && isNaN(inicio.getTime())) || (fim && isNaN(fim.getTime()))) {
		return jsonError('inicio/fim inválidos (use YYYY-MM-DD)', 400);
	}

	const { conteudo, nome } = await gerarAfd(admin.empresaId, { inicio, fim });

	return respostaDownload(empacotarAssinado(nome, conteudo, carregarCredencial()));
};
